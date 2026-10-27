/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'
import { checkDocumentation } from '../../bin/docs_check.js'

async function fixture(files: Record<string, string>, cleanup: (fn: () => Promise<void>) => void) {
  const root = await mkdtemp(join(tmpdir(), 'documentation-check-'))
  cleanup(() => rm(root, { recursive: true, force: true }))
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), contents)
  }
  return root
}

test.group('Documentation checks', () => {
  test('reports a missing local file at its original Markdown line', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Guide\n\n[Missing](docs/missing.md)\n' }, cleanup)
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [
      { file: 'README.md', line: 3, message: 'Missing file: docs/missing.md' },
    ])
  })

  test('reports a missing local heading anchor', async ({ assert, cleanup }) => {
    const root = await fixture({ 'README.md': '# Guide\n[Wrong](#missing)\n' }, cleanup)
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 1)
    assert.include(diagnostics[0].message, 'Missing anchor: #missing')
  })

  test('accepts relative files, encoded spaces, formatted headings and duplicate anchors', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '[Guide](<docs/other guide.md#restore-deleted-rows-1>)\n[Same](#home)\n# Home\n',
        'docs/other guide.md': '# Restore `deleted` rows\n# Restore **deleted** rows\n',
      },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })

  test('ignores links and headings in both fence styles and inline code', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '# Home\n`[not a link](missing.md)`\n```md\n[missing](missing.md)\n# fake\n```\n~~~text\n[missing](missing.md)\n~~~\n[bad](#fake)\n',
      },
      cleanup
    )
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 1)
    assert.include(diagnostics[0].message, 'Missing anchor: #fake')
  })

  test('supports reference links and explicit HTML anchors', async ({ assert, cleanup }) => {
    const root = await fixture(
      {
        'README.md':
          '[Read][guide]\n[anchor](#manual)\n<a id="manual"></a>\n[guide]: docs/guide.md#start\n',
        'docs/guide.md': '# Start\n',
      },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })

  test('does not fetch remote URLs and checks local image files', async ({ assert, cleanup }) => {
    const root = await fixture(
      {
        'README.md':
          '[Web](https://example.invalid/no-network)\n[Mail](mailto:help@example.test)\n![Missing](images/missing.png)\n',
      },
      cleanup
    )
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 1)
    assert.include(diagnostics[0].message, 'Missing file: images/missing.png')
  })

  test('matches a maintained TypeScript region to its documented fence', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '<!-- source: examples/demo.ts#demo -->\n\n```ts\nexport const value = 1\n```\n',
        'examples/demo.ts':
          '// copyright\n// #region demo\nexport const value = 1\n// #endregion demo\n',
      },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })

  test('rejects a documented fence that drifts from its source', async ({ assert, cleanup }) => {
    const root = await fixture(
      {
        'README.md': '<!-- source: demo.ts#demo -->\n```ts\nexport const value = 2\n```\n',
        'demo.ts': '// #region demo\nexport const value = 1\n// #endregion demo\n',
      },
      cleanup
    )
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 1)
    assert.include(diagnostics[0].message, 'Source example differs')
  })

  test('rejects absent regions, missing source files and dangling source markers', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '<!-- source: demo.ts#absent -->\n```ts\nvalue\n```\n<!-- source: missing.ts#demo -->\n```ts\nvalue\n```\n<!-- source: demo.ts#demo -->\nNo code fence follows.\n',
        'demo.ts': 'value\n',
      },
      cleanup
    )
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 3)
  })

  test('rejects checkout escapes and malformed URL encoding with useful diagnostics', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '[Escape](../private.md)\n[Bad](broken%ZZ.md)\n' },
      cleanup
    )
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 2)
    assert.include(diagnostics[0].message, 'outside the checkout')
    assert.include(diagnostics[1].message, 'Invalid URL encoding')
  })

  test('supports source-file line anchors and rejects out-of-range lines', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '[Code](demo.ts#L1-L2)\n[Wrong](demo.ts#L9)\n', 'demo.ts': 'one\ntwo\n' },
      cleanup
    )
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 1)
    assert.include(diagnostics[0].message, 'Missing anchor: #L9')
  })
  test('discovers tracked and unignored new Markdown with Git', async ({ assert, cleanup }) => {
    const root = await fixture(
      {
        'README.md': '# Home\n[Missing](tracked-missing.md)\n',
        'docs/new.md': '[Missing](untracked-missing.md)\n',
        '.gitignore': 'ignored.md\n',
        'ignored.md': '[wrong](missing.md)\n',
      },
      cleanup
    )
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet', root])
    execFileSync('git', ['add', 'README.md'], { cwd: root })
    const diagnostics = await checkDocumentation(root)
    assert.sameMembers(
      diagnostics.map((item) => item.file),
      ['README.md', 'docs/new.md']
    )
    assert.isTrue(diagnostics.every((item) => item.message.startsWith('Missing file:')))
  })

  test('reports an unreadable selected Markdown file and undefined reference', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '[Read][unknown]\n' }, cleanup)
    const diagnostics = await checkDocumentation(root, ['absent.md', 'README.md'])
    assert.lengthOf(diagnostics, 2)
    assert.include(diagnostics[0].message, 'Cannot read Markdown file')
    assert.include(diagnostics[1].message, 'Missing reference definition: unknown')
  })

  test('reports unfinished example fences and markers rather than silently skipping them', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '<!-- source: demo.ts#first -->\n<!-- source: demo.ts#second -->\n```ts\nnot closed\n',
      },
      cleanup
    )
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 2)
    assert.include(diagnostics[0].message, 'requires a following code fence')
    assert.include(diagnostics[1].message, 'requires a closed code fence')
  })

  test('accepts directory README anchors, collapsed references and link titles', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '[docs](docs/#start)\n[Guide][]\n[Guide]: docs/README.md\n[Title](docs/README.md "Read it")\n',
        'docs/README.md': '# Start\n',
      },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })

  test('CLI reports successful checks and exits nonzero for a broken link', async ({
    assert,
    cleanup,
  }) => {
    const repository = fileURLToPath(new URL('../../', import.meta.url))
    await mkdir(join(repository, 'tmp'), { recursive: true })
    const directory = await mkdtemp(join(repository, 'tmp', 'docs-cli-'))
    cleanup(() => rm(directory, { recursive: true, force: true }))
    const file = join(directory, 'README.md')
    await writeFile(file, '# Good\n')
    const run = () =>
      spawnSync(
        process.execPath,
        ['--import=@poppinss/ts-exec', 'bin/docs_check.ts', relative(repository, file)],
        { cwd: repository, encoding: 'utf8' }
      )
    const good = run()
    assert.equal(good.status, 0)
    assert.include(good.stdout, 'Documentation checks passed')
    await writeFile(file, '[bad](missing.md)\n')
    const bad = run()
    assert.equal(bad.status, 1)
    assert.include(bad.stderr, ':1: Missing file: missing.md')
  })
  test('checks shortcut and code-labelled references without interpreting inline code as links', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '[guide]\n[`guide`][guide]\n`[guide]`\n[guide]: missing.md\n' },
      cleanup
    )
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 2)
    assert.isTrue(diagnostics.every((item) => item.message === 'Missing file: missing.md'))
  })

  test('heading anchors remove underscore emphasis and preserve literal identifier underscores', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '# _Emphasized_ heading\n[Read](#emphasized-heading)\n## foo_bar\n[Code](#foo_bar)\n',
      },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })

  test('an HTML anchor displayed as inline code is not a real anchor', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '`<a id="fake"></a>`\n[Wrong](#fake)\n' }, cleanup)
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 1)
    assert.include(diagnostics[0].message, 'Missing anchor: #fake')
  })

  test('source line anchors include genuine trailing blank lines', async ({ assert, cleanup }) => {
    const root = await fixture(
      { 'README.md': '[Blank line](demo.ts#L2)\n', 'demo.ts': 'one\n\n' },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })
  test('heading anchors preserve underscores and angle-bracket contents inside inline code', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '# `_private_`\n[Private](#_private_)\n## `Model<T>`\n[Generic](#modelt)\n' },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })
})

/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import fsPromises, { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
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

async function withReadFileFailure<T>(
  path: string,
  code: string,
  operation: () => Promise<T>
): Promise<{ result: T; failures: number }> {
  const canonicalPath = await realpath(path)
  const originalReadFile = fsPromises.readFile
  let failures = 0
  Object.defineProperty(fsPromises, 'readFile', {
    value: (...args: Parameters<typeof originalReadFile>) => {
      if (args[0] === canonicalPath) {
        failures++
        return Promise.reject(Object.assign(new Error('injected read failure'), { code }))
      }
      return originalReadFile(...args)
    },
  })
  syncBuiltinESMExports()
  try {
    return { result: await operation(), failures }
  } finally {
    Object.defineProperty(fsPromises, 'readFile', { value: originalReadFile })
    syncBuiltinESMExports()
  }
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
  test('checks new docs layout Markdown while leaving historical changelog links alone', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md': '# Home\n[Missing](tracked-missing.md)\n',
        'CHANGELOG.md': '[Historic](docs/old-layout.md)\n',
        'docs/guide/getting-started.md': '[Missing](untracked-missing.md)\n',
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
      ['README.md', 'docs/guide/getting-started.md']
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
    assert.equal(diagnostics[0].message, 'Cannot read Markdown file: absent.md')
    assert.include(diagnostics[1].message, 'Missing reference definition: unknown')
  })

  test('rejects selected Markdown paths outside the checkout before reading them', async ({
    assert,
    cleanup,
  }) => {
    const workspace = await mkdtemp(join(tmpdir(), 'documentation-selected-outside-'))
    cleanup(() => rm(workspace, { recursive: true, force: true }))
    const root = join(workspace, 'repo')
    const external = join(workspace, 'outside.md')
    const externalDirectory = join(workspace, 'external')
    await mkdir(root)
    await mkdir(externalDirectory)
    await writeFile(external, '[leak](outside-only-missing.md)\n')
    await writeFile(join(externalDirectory, 'outside.md'), '[leak](outside-only-missing.md)\n')
    await symlink(external, join(root, 'external.md'))
    await symlink(externalDirectory, join(root, 'external-directory'))

    const originalReadFile = fsPromises.readFile
    let readCount = 0
    Object.defineProperty(fsPromises, 'readFile', {
      value: (...args: Parameters<typeof originalReadFile>) => {
        readCount++
        return originalReadFile(...args)
      },
    })
    syncBuiltinESMExports()
    try {
      const selected = [
        '../outside.md',
        external,
        'external.md',
        'external-directory/outside.md',
        'external-directory/missing.md',
      ]
      assert.deepEqual(
        await checkDocumentation(root, selected),
        selected.map((file) => ({
          file,
          line: 1,
          message: `Link points outside the checkout: ${file}`,
        }))
      )
      assert.equal(readCount, 0)
    } finally {
      Object.defineProperty(fsPromises, 'readFile', { value: originalReadFile })
      syncBuiltinESMExports()
    }
  })

  test('reports a selected Markdown read failure with its filesystem error code', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'docs/placeholder': '' }, cleanup)
    const path = join(root, 'docs')
    const injected = await withReadFileFailure(path, 'EISDIR', () =>
      checkDocumentation(root, ['docs'])
    )
    assert.equal(injected.failures, 1)
    assert.deepEqual(injected.result, [
      { file: 'docs', line: 1, message: 'Cannot read Markdown file: docs (EISDIR)' },
    ])

    const realDirectoryDiagnostics = await checkDocumentation(root, ['docs'])
    if (process.platform === 'freebsd')
      assert.notInclude(realDirectoryDiagnostics[0]?.message ?? '', '(EISDIR)')
    else
      assert.deepEqual(realDirectoryDiagnostics, [
        { file: 'docs', line: 1, message: 'Cannot read Markdown file: docs (EISDIR)' },
      ])
  })

  test('preserves checkout-root resolution failures', async ({ assert, cleanup }) => {
    const root = await mkdtemp(join(tmpdir(), 'documentation-missing-root-parent-'))
    cleanup(() => rm(root, { recursive: true, force: true }))
    const missingRoot = join(root, 'missing')
    await assert.rejects(
      () => checkDocumentation(missingRoot, ['README.md']),
      /Cannot resolve checkout root: .* \(ENOENT\)/
    )
  })

  test('accepts internal symlinks for links and maintained source markers', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '[guide](guide-link.md#inside)\n\n<!-- source: source-link.ts#demo -->\n```ts\nexport const value = 1\n```\n',
        'guide.md': '# Inside\n',
        'source.ts': '// #region demo\nexport const value = 1\n// #endregion demo\n',
      },
      cleanup
    )
    await symlink('guide.md', join(root, 'guide-link.md'))
    await symlink('source.ts', join(root, 'source-link.ts'))
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })

  test('accepts relative and absolute internal symlinks as selected Markdown', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'guide.md': '# Inside\n' }, cleanup)
    await symlink('guide.md', join(root, 'relative.md'))
    await symlink(join(root, 'guide.md'), join(root, 'absolute.md'))
    assert.deepEqual(await checkDocumentation(root, ['relative.md', join(root, 'absolute.md')]), [])
  })

  test('rejects Git-discovered selected Markdown symlinks outside the checkout', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Home\n' }, cleanup)
    const outside = await mkdtemp(join(tmpdir(), 'documentation-git-outside-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    const outsideFile = join(outside, 'outside.md')
    await writeFile(outsideFile, '[leak](outside-only-missing.md)\n')
    await symlink(outsideFile, join(root, 'external.md'))
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet', root])
    execFileSync('git', ['add', 'README.md', 'external.md'], { cwd: root })

    assert.deepEqual(await checkDocumentation(root), [
      {
        file: 'external.md',
        line: 1,
        message: 'Link points outside the checkout: external.md',
      },
    ])
  })

  test('uses logical target extensions when reading internal symlinks', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md': '[Guide](guide.md#start)\n[Code](source.ts#L1)\n',
        'guide-content.txt': '# Start\n',
        'source-content.md': 'export const value = 1\n',
      },
      cleanup
    )
    await symlink('guide-content.txt', join(root, 'guide.md'))
    await symlink('source-content.md', join(root, 'source.ts'))
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
  })

  test('rejects external symlink targets before reading link or source content', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md':
          '[outside](outside.md#inside)\n\n<!-- source: outside.ts#demo -->\n```ts\nexport const value = 1\n```\n',
      },
      cleanup
    )
    const outside = await mkdtemp(join(tmpdir(), 'documentation-outside-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'guide.md'), '# Inside\n')
    await writeFile(
      join(outside, 'source.ts'),
      '// #region demo\nexport const value = 1\n// #endregion demo\n'
    )
    await symlink(join(outside, 'guide.md'), join(root, 'outside.md'))
    await symlink(join(outside, 'source.ts'), join(root, 'outside.ts'))
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 2)
    assert.isTrue(
      diagnostics.every(
        (item) =>
          item.message ===
          'Link points outside the checkout: ' +
            (item.line === 1 ? 'outside.md#inside' : 'outside.ts#demo')
      )
    )
  })

  test('rejects missing children below an external symlink parent', async ({ assert, cleanup }) => {
    const root = await fixture({ 'README.md': '[outside](outside/missing.md)\n' }, cleanup)
    const outside = await mkdtemp(join(tmpdir(), 'documentation-outside-parent-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await symlink(outside, join(root, 'outside'))
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [
      {
        file: 'README.md',
        line: 1,
        message: 'Link points outside the checkout: outside/missing.md',
      },
    ])
  })

  test('validates a directory README symlink and accepts an internal README symlink', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md': '[inside](inside/#start)\n[outside](outside/#start)\n',
        'inside/index.md': '# Start\n',
        'outside/index.md': '# Start\n',
      },
      cleanup
    )
    const outside = await mkdtemp(join(tmpdir(), 'documentation-outside-readme-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'README.md'), '# Start\n')
    await symlink('index.md', join(root, 'inside', 'README.md'))
    await symlink(join(outside, 'README.md'), join(root, 'outside', 'README.md'))
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 1)
    assert.equal(diagnostics[0].message, 'Link points outside the checkout: outside/#start')
  })

  test('supports a checkout root that is itself a symlink', async ({ assert, cleanup }) => {
    const actualRoot = await fixture(
      { 'README.md': '[guide](guide.md#start)\n', 'guide.md': '# Start\n' },
      cleanup
    )
    const rootLink = join(tmpdir(), `documentation-root-link-${process.pid}-${Date.now()}`)
    cleanup(() => rm(rootLink, { force: true }))
    await symlink(actualRoot, rootLink)
    assert.deepEqual(await checkDocumentation(rootLink, ['README.md']), [])
  })

  test('reports non-missing source read failures with their filesystem error code', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md': '<!-- source: directory#demo -->\n```ts\nvalue\n```\n',
        'directory/placeholder': '',
      },
      cleanup
    )
    const sourcePath = join(root, 'directory')
    const injected = await withReadFileFailure(sourcePath, 'EISDIR', () =>
      checkDocumentation(root, ['README.md'])
    )
    assert.equal(injected.failures, 1)
    const diagnostics = injected.result
    assert.lengthOf(diagnostics, 1)
    assert.match(diagnostics[0].message, /^Cannot read source file: directory#demo \(EISDIR\)$/)

    const realDirectoryDiagnostics = await checkDocumentation(root, ['README.md'])
    if (process.platform === 'freebsd')
      assert.notInclude(realDirectoryDiagnostics[0]?.message ?? '', '(EISDIR)')
    else
      assert.match(
        realDirectoryDiagnostics[0].message,
        /^Cannot read source file: directory#demo \(EISDIR\)$/
      )
  })

  test('reports a non-missing stat failure as an inspection error', async ({ assert, cleanup }) => {
    const root = await fixture(
      { 'README.md': '[Guide](guide.md#start)\n', 'guide.md': '# Start\n' },
      cleanup
    )
    const originalStat = fsPromises.stat
    Object.defineProperty(fsPromises, 'stat', {
      value: async () => {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
      },
    })
    syncBuiltinESMExports()
    try {
      assert.deepEqual(await checkDocumentation(root, ['README.md']), [
        {
          file: 'README.md',
          line: 1,
          message: 'Cannot inspect file: guide.md#start (EACCES)',
        },
      ])
    } finally {
      Object.defineProperty(fsPromises, 'stat', { value: originalStat })
      syncBuiltinESMExports()
    }
  })

  test('classifies missing directory anchors as missing files', async ({ assert, cleanup }) => {
    const root = await fixture(
      { 'README.md': '[Guide](guide/#start)\n', 'guide/keep': '' },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [
      { file: 'README.md', line: 1, message: 'Missing file: guide/#start' },
    ])
  })

  test('reports non-missing directory anchor reads with their filesystem error code', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '[Guide](guide/#start)\n', 'guide/README.md/placeholder': '' },
      cleanup
    )
    const directoryReadPath = join(root, 'guide', 'README.md')
    const injected = await withReadFileFailure(directoryReadPath, 'EISDIR', () =>
      checkDocumentation(root, ['README.md'])
    )
    assert.equal(injected.failures, 1)
    assert.deepEqual(injected.result, [
      {
        file: 'README.md',
        line: 1,
        message: 'Cannot read file: guide/#start (EISDIR)',
      },
    ])

    const realDirectoryDiagnostics = await checkDocumentation(root, ['README.md'])
    if (process.platform === 'freebsd')
      assert.notInclude(realDirectoryDiagnostics[0]?.message ?? '', '(EISDIR)')
    else
      assert.deepEqual(realDirectoryDiagnostics, [
        {
          file: 'README.md',
          line: 1,
          message: 'Cannot read file: guide/#start (EISDIR)',
        },
      ])
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
    const run = (target = file) =>
      spawnSync(
        process.execPath,
        ['--import=@poppinss/ts-exec', 'bin/docs_check.ts', relative(repository, target)],
        { cwd: repository, encoding: 'utf8' }
      )
    const good = run()
    assert.equal(good.status, 0)
    assert.include(good.stdout, 'Documentation checks passed')
    await writeFile(file, '[bad](missing.md)\n')
    const bad = run()
    assert.equal(bad.status, 1)
    assert.include(bad.stderr, ':1: Missing file: missing.md')
    const outside = await mkdtemp(join(tmpdir(), 'documentation-cli-outside-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    const externalFile = join(outside, 'outside.md')
    await writeFile(externalFile, '[leak](outside-only-missing.md)\n')
    const externalLink = join(directory, 'external.md')
    await symlink(externalFile, externalLink)
    const escaped = run(externalLink)
    assert.equal(escaped.status, 1)
    assert.include(escaped.stderr, ':1: Link points outside the checkout:')
    assert.notInclude(escaped.stderr, 'outside-only-missing.md')
  })
  test('checks shortcut and code-labeled references without interpreting inline code as links', async ({
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

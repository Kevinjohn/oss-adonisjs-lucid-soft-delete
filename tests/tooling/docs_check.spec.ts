/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import {
  access,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'
import { checkDocumentation, type Diagnostic } from '../../bin/docs_check.js'

async function fixture(files: Record<string, string>, cleanup: (fn: () => Promise<void>) => void) {
  const root = await mkdtemp(join(tmpdir(), 'documentation-check-'))
  cleanup(() => rm(root, { recursive: true, force: true }))
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), contents)
  }
  return root
}

async function testHelperLauncher(directory: string): Promise<string> {
  const wrapperSource = fileURLToPath(new URL('./docs_fs_wrapper.py', import.meta.url))
  const launcher = join(directory, 'docs-fs-test-wrapper')
  await writeFile(launcher, await readFile(wrapperSource))
  await chmod(launcher, 0o755)
  return launcher
}

async function checkAtFilesystemBarrier(
  root: string,
  target: string,
  operation: 'read' | 'stat',
  phase: 'before-final-open' | 'after-ancestor-open',
  cleanup: (fn: () => Promise<void>) => void,
  mutate: () => Promise<void>
) {
  const barrier = await mkdtemp(join(tmpdir(), 'documentation-filesystem-barrier-'))
  cleanup(() => rm(barrier, { recursive: true, force: true }))
  const launcher = await testHelperLauncher(barrier)
  const previousPython = process.env.PYTHON
  const previousDirectory = process.env.DOCS_FS_TEST_BARRIER_DIR
  const previousTarget = process.env.DOCS_FS_TEST_BARRIER_TARGET
  const previousOperation = process.env.DOCS_FS_TEST_BARRIER_OPERATION
  const previousPhase = process.env.DOCS_FS_TEST_BARRIER_PHASE
  process.env.PYTHON = launcher
  process.env.DOCS_FS_TEST_BARRIER_DIR = barrier
  process.env.DOCS_FS_TEST_BARRIER_TARGET = target
  process.env.DOCS_FS_TEST_BARRIER_OPERATION = operation
  process.env.DOCS_FS_TEST_BARRIER_PHASE = phase
  let checking: Promise<Diagnostic[]> | undefined
  try {
    checking = checkDocumentation(root, ['README.md'])
    const ready = (async () => {
      const deadline = Date.now() + 10_000
      while (true) {
        try {
          await access(join(barrier, `${phase}-ready`))
          return 'ready'
        } catch {
          if (Date.now() >= deadline) throw new Error('Documentation filesystem barrier timed out')
          await new Promise((resume) => setTimeout(resume, 5))
        }
      }
    })()
    const completed = checking.then(
      () => 'completed',
      (error) => Promise.reject(error)
    )
    if ((await Promise.race([ready, completed])) !== 'ready')
      throw new Error('Documentation check completed before reaching its filesystem barrier')
    await mutate()
    await writeFile(join(barrier, `${phase}-resume`), '')
    return await checking
  } finally {
    await writeFile(join(barrier, `${phase}-resume`), '').catch(() => {})
    await checking?.catch(() => {})
    if (previousPython === undefined) delete process.env.PYTHON
    else process.env.PYTHON = previousPython
    if (previousDirectory === undefined) delete process.env.DOCS_FS_TEST_BARRIER_DIR
    else process.env.DOCS_FS_TEST_BARRIER_DIR = previousDirectory
    if (previousTarget === undefined) delete process.env.DOCS_FS_TEST_BARRIER_TARGET
    else process.env.DOCS_FS_TEST_BARRIER_TARGET = previousTarget
    if (previousOperation === undefined) delete process.env.DOCS_FS_TEST_BARRIER_OPERATION
    else process.env.DOCS_FS_TEST_BARRIER_OPERATION = previousOperation
    if (previousPhase === undefined) delete process.env.DOCS_FS_TEST_BARRIER_PHASE
    else process.env.DOCS_FS_TEST_BARRIER_PHASE = previousPhase
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
    assert.equal(diagnostics[0].message, 'Cannot read Markdown file: absent.md')
    assert.include(diagnostics[1].message, 'Missing reference definition: unknown')
  })

  test('reports a selected Markdown read failure with its filesystem error code', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'docs/placeholder': '' }, cleanup)
    assert.deepEqual(await checkDocumentation(root, ['docs']), [
      { file: 'docs', line: 1, message: 'Cannot read Markdown file: docs (EISDIR)' },
    ])
  })

  test('rejects a helper whose input pipe closes without taking down the test process', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Home\n' }, cleanup)
    const helper = join(root, 'python-shim')
    const release = join(root, 'release-helper')
    cleanup(() => rm(release, { force: true }))
    await writeFile(
      helper,
      "#!/bin/sh\nexec 0<&-\nprintf 'helper diagnostic\\n' >&2\nprintf '%s\\n' '{\"ready\":true}'\nwhile [ ! -e \"$DOCS_FS_TEST_PIPE_RELEASE\" ]; do sleep 0.01; done\n"
    )
    await chmod(helper, 0o755)
    const previousPython = process.env.PYTHON
    const previousRelease = process.env.DOCS_FS_TEST_PIPE_RELEASE
    process.env.PYTHON = helper
    process.env.DOCS_FS_TEST_PIPE_RELEASE = release
    try {
      await assert.rejects(() => checkDocumentation(root, ['README.md']), /EPIPE|helper/)
    } finally {
      await writeFile(release, '')
      if (previousPython === undefined) delete process.env.PYTHON
      else process.env.PYTHON = previousPython
      if (previousRelease === undefined) delete process.env.DOCS_FS_TEST_PIPE_RELEASE
      else process.env.DOCS_FS_TEST_PIPE_RELEASE = previousRelease
    }
  })

  test('rejects a helper that exits immediately after becoming ready', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Home\n' }, cleanup)
    const helper = join(root, 'python-shim')
    await writeFile(
      helper,
      "#!/bin/sh\nexec 0<&-\nprintf '%s\\n' '{\"ready\":true}'\nprintf 'helper exited\\n' >&2\nexit 1\n"
    )
    await chmod(helper, 0o755)
    const previousPython = process.env.PYTHON
    process.env.PYTHON = helper
    try {
      await assert.rejects(() => checkDocumentation(root, ['README.md']), /helper/)
    } finally {
      if (previousPython === undefined) delete process.env.PYTHON
      else process.env.PYTHON = previousPython
    }
  })

  test('rejects when the documentation filesystem helper cannot start', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Home\n' }, cleanup)
    const previousPython = process.env.PYTHON
    process.env.PYTHON = join(root, 'missing-python')
    try {
      await assert.rejects(
        () => checkDocumentation(root, ['README.md']),
        /Cannot start documentation filesystem helper.*ENOENT/
      )
    } finally {
      if (previousPython === undefined) delete process.env.PYTHON
      else process.env.PYTHON = previousPython
    }
  })

  test('rejects an invalid startup response from the documentation filesystem helper', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Home\n' }, cleanup)
    const helper = join(root, 'python-shim')
    await writeFile(helper, "#!/bin/sh\nprintf '%s\\n' 'not-json'\n")
    await chmod(helper, 0o755)
    const previousPython = process.env.PYTHON
    process.env.PYTHON = helper
    try {
      await assert.rejects(() => checkDocumentation(root, ['README.md']), /Invalid response/)
    } finally {
      if (previousPython === undefined) delete process.env.PYTHON
      else process.env.PYTHON = previousPython
    }
  })

  test('rejects a negative startup response from the documentation filesystem helper', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Home\n' }, cleanup)
    const helper = join(root, 'python-shim')
    await writeFile(
      helper,
      '#!/bin/sh\nprintf \'%s\\n\' \'{"ready":false,"error":{"message":"capability probe failed"}}\'\n'
    )
    await chmod(helper, 0o755)
    const previousPython = process.env.PYTHON
    process.env.PYTHON = helper
    try {
      await assert.rejects(() => checkDocumentation(root, ['README.md']), /capability probe failed/)
    } finally {
      if (previousPython === undefined) delete process.env.PYTHON
      else process.env.PYTHON = previousPython
    }
  })

  test('rejects an invalid helper response while a filesystem request is pending', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Home\n' }, cleanup)
    const launcher = await testHelperLauncher(root)
    const previousPython = process.env.PYTHON
    const previousFailureMode = process.env.DOCS_FS_TEST_RESPONSE_FAILURE
    process.env.PYTHON = launcher
    process.env.DOCS_FS_TEST_RESPONSE_FAILURE = 'invalid'
    try {
      await assert.rejects(() => checkDocumentation(root, ['README.md']), /Invalid response/)
    } finally {
      if (previousPython === undefined) delete process.env.PYTHON
      else process.env.PYTHON = previousPython
      if (previousFailureMode === undefined) delete process.env.DOCS_FS_TEST_RESPONSE_FAILURE
      else process.env.DOCS_FS_TEST_RESPONSE_FAILURE = previousFailureMode
    }
  })

  test('preserves an uncoded filesystem helper error', async ({ assert, cleanup }) => {
    const root = await fixture({ 'README.md': '# Home\n' }, cleanup)
    const launcher = await testHelperLauncher(root)
    const previousPython = process.env.PYTHON
    const previousFailureMode = process.env.DOCS_FS_TEST_RESPONSE_FAILURE
    process.env.PYTHON = launcher
    process.env.DOCS_FS_TEST_RESPONSE_FAILURE = 'uncoded'
    try {
      await assert.rejects(() => checkDocumentation(root, ['README.md']), /uncoded failure/)
    } finally {
      if (previousPython === undefined) delete process.env.PYTHON
      else process.env.PYTHON = previousPython
      if (previousFailureMode === undefined) delete process.env.DOCS_FS_TEST_RESPONSE_FAILURE
      else process.env.DOCS_FS_TEST_RESPONSE_FAILURE = previousFailureMode
    }
  })

  test('rejects a FIFO without blocking the documentation check', async ({ assert, cleanup }) => {
    const root = await fixture({ 'README.md': '[Pipe](pipe.md#section)\n' }, cleanup)
    execFileSync('python3', ['-c', 'import os,sys; os.mkfifo(sys.argv[1])', join(root, 'pipe.md')])

    assert.deepEqual(await checkDocumentation(root, ['README.md']), [
      {
        file: 'README.md',
        line: 1,
        message: 'Cannot inspect file: pipe.md#section (EINVAL)',
      },
    ])
  })

  test('stats inaccessible files and traverses search-only directories', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md': '[Locked](locked.md)\n[Subdirectory](search-only#visible)\n',
        'locked.md': '# Locked\n',
        'search-only/README.md': '# Visible\n',
      },
      cleanup
    )
    await chmod(join(root, 'locked.md'), 0)
    await chmod(join(root, 'search-only'), 0o111)
    try {
      assert.deepEqual(await checkDocumentation(root, ['README.md']), [])
    } finally {
      await chmod(join(root, 'search-only'), 0o755)
    }
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

  test('accepts absolute internal symlinks for selected, anchor and source files', async ({
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
    await symlink(join(root, 'README.md'), join(root, 'input-link.md'))
    await symlink(join(root, 'guide.md'), join(root, 'guide-link.md'))
    await symlink(join(root, 'source.ts'), join(root, 'source-link.ts'))

    assert.deepEqual(await checkDocumentation(root, ['input-link.md']), [])
  })

  test('confines explicitly selected Markdown symlinks to the checkout', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Internal\n' }, cleanup)
    const outside = await mkdtemp(join(tmpdir(), 'documentation-outside-input-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'outside.md'), '[bad](missing.md)\n')
    await symlink(join(outside, 'outside.md'), join(root, 'outside.md'))
    await symlink('README.md', join(root, 'internal.md'))

    assert.deepEqual(await checkDocumentation(root, ['internal.md']), [])
    assert.deepEqual(await checkDocumentation(root, ['outside.md']), [
      {
        file: 'outside.md',
        line: 1,
        message: 'Markdown file points outside the checkout: outside.md',
      },
    ])
  })

  test('confines Git-discovered Markdown symlinks to the checkout', async ({ assert, cleanup }) => {
    const root = await fixture({ 'README.md': '# Internal\n' }, cleanup)
    const outside = await mkdtemp(join(tmpdir(), 'documentation-outside-git-input-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'outside.md'), '[bad](missing.md)\n')
    await symlink(join(outside, 'outside.md'), join(root, 'outside.md'))
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet', root])
    execFileSync('git', ['add', 'outside.md'], { cwd: root })

    assert.deepEqual(await checkDocumentation(root), [
      {
        file: 'outside.md',
        line: 1,
        message: 'Markdown file points outside the checkout: outside.md',
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

  test('rejects an in-checkout file replaced by an external symlink before final open', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '[Guide](guide.md#escaped)\n', 'guide.md': '# Safe\n' },
      cleanup
    )
    const outside = await mkdtemp(join(tmpdir(), 'documentation-file-race-outside-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'outside.md'), '# Escaped\n')

    const diagnostics = await checkAtFilesystemBarrier(
      root,
      'guide.md',
      'read',
      'before-final-open',
      cleanup,
      async () => {
        await rename(join(root, 'guide.md'), join(root, 'guide-original.md'))
        await symlink(join(outside, 'outside.md'), join(root, 'guide.md'))
      }
    )
    assert.lengthOf(diagnostics, 1)
    assert.equal(diagnostics[0].message, 'Link points outside the checkout: guide.md#escaped')
  })

  test('rejects an ancestor replaced by an external symlink before final open', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '[Guide](inside/guide.md#escaped)\n', 'inside/guide.md': '# Safe\n' },
      cleanup
    )
    const outside = await mkdtemp(join(tmpdir(), 'documentation-ancestor-race-outside-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'guide.md'), '# Escaped\n')

    const diagnostics = await checkAtFilesystemBarrier(
      root,
      'inside/guide.md',
      'read',
      'before-final-open',
      cleanup,
      async () => {
        await rename(join(root, 'inside'), join(root, 'inside-original'))
        await symlink(outside, join(root, 'inside'))
      }
    )
    assert.lengthOf(diagnostics, 1)
    assert.equal(
      diagnostics[0].message,
      'Link points outside the checkout: inside/guide.md#escaped'
    )
  })

  test('rejects a moved ancestor even when an outside replacement file appears', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '[Guide](inside/guide.md#escaped)\n', 'inside/guide.md': '# Safe\n' },
      cleanup
    )
    const outside = await mkdtemp(join(tmpdir(), 'documentation-moved-ancestor-outside-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))

    const diagnostics = await checkAtFilesystemBarrier(
      root,
      'inside/guide.md',
      'read',
      'after-ancestor-open',
      cleanup,
      async () => {
        await rename(join(root, 'inside'), join(outside, 'moved'))
        await rm(join(outside, 'moved', 'guide.md'))
        await writeFile(join(outside, 'moved', 'guide.md'), '# Escaped\n')
      }
    )
    assert.deepEqual(diagnostics, [
      { file: 'README.md', line: 1, message: 'Missing file: inside/guide.md#escaped' },
    ])
  })

  test('rejects a selected Markdown file replaced by an external symlink before read', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture({ 'README.md': '# Safe\n' }, cleanup)
    const outside = await mkdtemp(join(tmpdir(), 'documentation-input-read-race-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'outside.md'), '[bad](outside-only.md)\n')

    const diagnostics = await checkAtFilesystemBarrier(
      root,
      'README.md',
      'read',
      'before-final-open',
      cleanup,
      async () => {
        await rename(join(root, 'README.md'), join(root, 'README-original.md'))
        await symlink(join(outside, 'outside.md'), join(root, 'README.md'))
      }
    )
    assert.deepEqual(diagnostics, [
      {
        file: 'README.md',
        line: 1,
        message: 'Markdown file points outside the checkout: README.md',
      },
    ])
  })

  test('rejects a source file replaced by an external symlink before read', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      {
        'README.md': '<!-- source: demo.ts#demo -->\n```ts\nexport const value = 1\n```\n',
        'demo.ts': '// #region demo\nexport const value = 1\n// #endregion demo\n',
      },
      cleanup
    )
    const outside = await mkdtemp(join(tmpdir(), 'documentation-source-read-race-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(
      join(outside, 'outside.ts'),
      '// #region demo\nexport const value = 1\n// #endregion demo\n'
    )

    const diagnostics = await checkAtFilesystemBarrier(
      root,
      'demo.ts',
      'read',
      'before-final-open',
      cleanup,
      async () => {
        await rename(join(root, 'demo.ts'), join(root, 'demo-original.ts'))
        await symlink(join(outside, 'outside.ts'), join(root, 'demo.ts'))
      }
    )
    assert.deepEqual(diagnostics, [
      { file: 'README.md', line: 1, message: 'Link points outside the checkout: demo.ts#demo' },
    ])
  })

  test('rejects a directory README replaced by an external symlink before read', async ({
    assert,
    cleanup,
  }) => {
    const root = await fixture(
      { 'README.md': '[Guide](docs/#escaped)\n', 'docs/README.md': '# Escaped\n' },
      cleanup
    )
    const outside = await mkdtemp(join(tmpdir(), 'documentation-directory-read-race-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'outside.md'), '# Escaped\n')

    const diagnostics = await checkAtFilesystemBarrier(
      root,
      'docs/README.md',
      'read',
      'before-final-open',
      cleanup,
      async () => {
        await rename(join(root, 'docs/README.md'), join(root, 'docs/README-original.md'))
        await symlink(join(outside, 'outside.md'), join(root, 'docs/README.md'))
      }
    )
    assert.deepEqual(diagnostics, [
      { file: 'README.md', line: 1, message: 'Link points outside the checkout: docs/#escaped' },
    ])
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
    const diagnostics = await checkDocumentation(root, ['README.md'])
    assert.lengthOf(diagnostics, 1)
    assert.match(diagnostics[0].message, /^Cannot read source file: directory#demo \(EISDIR\)$/)
  })

  test('reports a non-missing stat failure as an inspection error', async ({ assert, cleanup }) => {
    const root = await fixture(
      { 'README.md': '[Guide](guide.md#start)\n', 'guide.md': '# Start\n' },
      cleanup
    )
    const wrapperDirectory = await mkdtemp(join(tmpdir(), 'documentation-fs-fault-'))
    cleanup(() => rm(wrapperDirectory, { recursive: true, force: true }))
    const launcher = await testHelperLauncher(wrapperDirectory)
    const previousPython = process.env.PYTHON
    const previousOperation = process.env.DOCS_FS_TEST_FAIL_OPERATION
    const previousTarget = process.env.DOCS_FS_TEST_FAIL_TARGET
    process.env.PYTHON = launcher
    process.env.DOCS_FS_TEST_FAIL_OPERATION = 'stat'
    process.env.DOCS_FS_TEST_FAIL_TARGET = 'guide.md'
    try {
      assert.deepEqual(await checkDocumentation(root, ['README.md']), [
        {
          file: 'README.md',
          line: 1,
          message: 'Cannot inspect file: guide.md#start (EACCES)',
        },
      ])
    } finally {
      if (previousPython === undefined) delete process.env.PYTHON
      else process.env.PYTHON = previousPython
      if (previousOperation === undefined) delete process.env.DOCS_FS_TEST_FAIL_OPERATION
      else process.env.DOCS_FS_TEST_FAIL_OPERATION = previousOperation
      if (previousTarget === undefined) delete process.env.DOCS_FS_TEST_FAIL_TARGET
      else process.env.DOCS_FS_TEST_FAIL_TARGET = previousTarget
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

  test('reports a non-directory ancestor as an inspection failure', async ({ assert, cleanup }) => {
    const root = await fixture(
      { 'README.md': '[Guide](file/guide.md)\n', 'file': 'contents' },
      cleanup
    )
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [
      {
        file: 'README.md',
        line: 1,
        message: 'Cannot inspect file: file/guide.md (ENOTDIR)',
      },
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
    assert.deepEqual(await checkDocumentation(root, ['README.md']), [
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
    const outside = await mkdtemp(join(tmpdir(), 'documentation-cli-outside-'))
    cleanup(() => rm(outside, { recursive: true, force: true }))
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
    const externalMarkdown = join(outside, 'README.md')
    await writeFile(externalMarkdown, '[bad](missing.md)\n')
    const outsideLink = join(directory, 'outside.md')
    await symlink(externalMarkdown, outsideLink)
    const external = run(outsideLink)
    assert.equal(external.status, 1)
    assert.include(external.stderr, 'Markdown file points outside the checkout:')
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

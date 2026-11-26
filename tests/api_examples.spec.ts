/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))

test.group('Public API examples', () => {
  if (!process.env.TEST_BUILT_EXPORTS) return

  test('type-checks the TSDoc examples against the built public exports', async ({ assert }) => {
    const examples = new Map<string, string>()
    const model = join(root, 'tests/api_example_user.ts')
    const sources = [
      'src/mixin.ts',
      'src/guard.ts',
      'src/bindings/model_query_builder.ts',
      'providers/lucid_soft_delete_provider.ts',
    ]
    for (const source of sources) {
      const text = await readFile(join(root, source), 'utf8')
      for (const match of text.matchAll(/\* @example\n\s*\* ```ts\n([\s\S]*?)\n\s*\* ```/g)) {
        const line = text.slice(0, match.index).split('\n').length
        const snippet = match[1].replace(/^\s*\* ?/gm, '')
        const queryContext =
          text.lastIndexOf("declare module '@adonisjs/lucid/orm'", match.index) === -1
            ? 'const query = User.query()\n'
            : 'import { ModelQueryBuilder } from "@adonisjs/lucid/orm"\n' +
              'const builder = User.query()\n' +
              'if (!(builder instanceof ModelQueryBuilder)) throw new TypeError("Expected a Lucid model query")\n' +
              'const query: ModelQueryBuilder & { model: typeof User } = builder\n'
        const example = join(root, `${source}-example-${line}.ts`)
        const modelImport = relative(dirname(example), model).replaceAll('\\', '/')
        const preamble = snippet.startsWith('import ')
          ? ''
          : `import User from '${modelImport}'\n` +
            'declare const user: InstanceType<typeof User>\n' +
            queryContext
        examples.set(example, preamble + snippet)
      }
    }
    assert.isAbove(examples.size, 0)

    // Resolve the example model's package import as a self-reference in this checkout.
    examples.set(model, await readFile(join(root, 'examples/app/app/models/user.ts'), 'utf8'))

    const options: ts.CompilerOptions = {
      module: ts.ModuleKind.NodeNext,
      target: ts.ScriptTarget.ESNext,
      strict: true,
      experimentalDecorators: true,
      skipLibCheck: true,
      noEmit: true,
      rewriteRelativeImportExtensions: true,
      paths: {
        '#models/user': [model],
        '#database/schema': [join(root, 'examples/app/database/schema.ts')],
      },
    }
    const host = ts.createCompilerHost(options)
    const { fileExists, readFile: readSource } = host
    host.fileExists = (path) => examples.has(path) || fileExists(path)
    host.readFile = (path) => examples.get(path) ?? readSource(path)

    const program = ts.createProgram([...examples.keys()], options, host)
    assert.equal(
      ts.formatDiagnosticsWithColorAndContext(ts.getPreEmitDiagnostics(program), host),
      ''
    )
  })
})

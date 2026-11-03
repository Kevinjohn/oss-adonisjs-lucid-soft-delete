/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from '@japa/runner'
import { ListLoader } from '@adonisjs/core/ace'
import Configure from '@adonisjs/core/commands/configure'
import { IgnitorFactory } from '@adonisjs/core/factories'

const cases = [
  { name: 'fresh app', providerEntry: '' },
  {
    name: 'app with an existing provider',
    providerEntry: `() => import('@adonisjs/core/providers/app_provider')`,
  },
]

for (const { name, providerEntry } of cases) {
  test(`configure saves one provider after two runs in a ${name}`, async ({ assert }) => {
    const root = await mkdtemp(join(tmpdir(), 'adonisjs-lucid-soft-delete-configure-'))
    try {
      await writeFile(
        join(root, 'package.json'),
        '{"type":"module","devDependencies":{"@adonisjs/assembler":"8.6.0"}}'
      )
      await writeFile(join(root, 'tsconfig.json'), '{}')
      await writeFile(
        join(root, 'adonisrc.ts'),
        `import { defineConfig } from '@adonisjs/core/app'\nexport default defineConfig({ providers: [${providerEntry}] })\n`
      )
      await symlink(
        fileURLToPath(new URL('../node_modules', import.meta.url)),
        join(root, 'node_modules')
      )

      const importer = (specifier: string) =>
        specifier === '@kevinjohn/adonisjs-lucid-soft-delete'
          ? import(new URL('../index.ts', import.meta.url).href)
          : import(specifier)
      const ignitor = new IgnitorFactory()
        .withCoreProviders()
        .withCoreConfig()
        .merge({
          rcFileContents: {
            providers: [],
            commands: [async () => new ListLoader([Configure])],
          },
        })
        .create(pathToFileURL(`${root}/`), { importer })

      await ignitor.ace().handle(['configure', '@kevinjohn/adonisjs-lucid-soft-delete'])
      const afterFirstRun = await readFile(join(root, 'adonisrc.ts'), 'utf8')
      assert.equal(
        afterFirstRun.match(/@kevinjohn\/adonisjs-lucid-soft-delete\/lucid_soft_delete_provider/g)
          ?.length,
        1
      )
      if (providerEntry) assert.include(afterFirstRun, providerEntry)

      await ignitor.ace().handle(['configure', '@kevinjohn/adonisjs-lucid-soft-delete'])
      assert.equal(await readFile(join(root, 'adonisrc.ts'), 'utf8'), afterFirstRun)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }).timeout(20_000)
}

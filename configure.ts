import type Configure from '@adonisjs/core/commands/configure'

/**
 * The `node ace configure @kevinjohn/adonisjs-lucid-soft-delete` hook. Registers the provider in
 * `adonisrc.ts` through the host's `@adonisjs/assembler` codemods; running it again changes nothing.
 * It does not create migrations.
 */
export async function configure(command: Configure) {
  const codemods = await command.createCodemods()
  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@kevinjohn/adonisjs-lucid-soft-delete/lucid_soft_delete_provider')
  })
}

import type Configure from '@adonisjs/core/commands/configure'

export async function configure(command: Configure) {
  const codemods = await command.createCodemods()
  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@kevinjohn/adonisjs-lucid-soft-delete/lucid_soft_delete_provider')
  })
}

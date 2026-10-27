/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2024 Lookin Anton <alsd@lookinlab.ru>
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type Configure from '@adonisjs/core/commands/configure'

export async function configure(command: Configure) {
  const codemods = await command.createCodemods()
  const project = await codemods.getTsMorphProject()

  if (project) {
    const rcFile = project.getSourceFile(command.app.makePath('adonisrc.ts'))
    if (rcFile) {
      const arrayLiterals = rcFile
        .getDescendants()
        .filter((node) => node.getKindName() === 'ArrayLiteralExpression')

      for (const node of arrayLiterals.reverse()) {
        const array = node as unknown as {
          getElements(): Array<{ getText(): string }>
          removeElement(element: { getText(): string }): void
        }
        for (const element of array.getElements()) {
          if (element.getText().includes('adonis-lucid-soft-deletes/provider')) {
            array.removeElement(element)
          }
        }
      }
      await rcFile.save()
    }
  }

  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@kevinjohn/lucid-soft-deletes/provider')
  })
}

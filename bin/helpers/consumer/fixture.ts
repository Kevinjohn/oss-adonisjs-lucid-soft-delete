/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { cp, mkdir } from 'node:fs/promises'
import { relative, sep } from 'node:path'

/** Copy filtered filesystem inputs, including untracked files, into a fresh application. */
export async function copyFixture(source: string, destination: string) {
  const omitted = new Set(['node_modules', 'tmp', 'build', '.adonisjs', '.git'])
  await cp(source, destination, {
    recursive: true,
    filter(path) {
      const components = relative(source, path).split(sep)
      if (components.some((component) => omitted.has(component))) return false
      const name = components.at(-1) ?? ''
      return !/^\.env(?:$|\.)/.test(name) || name === '.env.example'
    },
  })
  await mkdir(`${destination}/tmp`, { recursive: true })
}

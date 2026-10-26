#!/usr/bin/env node

/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { runFresh } from './consumer/fresh.mjs'
import { run } from './consumer/harness.mjs'
import { runMinimum } from './consumer/minimum.mjs'
import { compatibility, database, repoRoot, tempRoot } from './consumer/settings.mjs'

async function packCandidate() {
  run('pnpm', ['build'], repoRoot)
  const destination = join(tempRoot, 'package')
  await mkdir(destination)
  run('pnpm', ['pack', '--pack-destination', destination], repoRoot)
  const archives = (await readdir(destination)).filter((name) => name.endsWith('.tgz'))
  if (archives.length !== 1) {
    throw new Error(`Expected one packed package archive; found ${archives.length}`)
  }
  return join(destination, archives[0])
}

try {
  const archive = await packCandidate()
  const result = compatibility === 'minimum' ? await runMinimum(archive) : await runFresh(archive)
  console.log(`\nInstalled-consumer gate passed (${compatibility}, ${database})`)
  console.log(`Installed package: ${result.installedPath}`)
  console.log(`Installed version: ${result.version}`)
  await rm(tempRoot, { recursive: true, force: true })
} catch (error) {
  console.error(error?.stack ?? error)
  console.error(`Consumer run directory kept for inspection: ${tempRoot}`)
  process.exitCode = 1
}

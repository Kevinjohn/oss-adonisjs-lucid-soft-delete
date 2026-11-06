/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'

const workflowPath = fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url))

/** Each job's block under `jobs:`, keyed by name, with its `needs` list. */
function jobs(workflow: string): Map<string, { block: string; needs: string[] }> {
  const result = new Map<string, { block: string; needs: string[] }>()
  const body = workflow.slice(workflow.indexOf('\njobs:\n'))
  for (const [, name, block] of body.matchAll(/^ {2}([\w-]+):\n((?: {4}.*\n|\s*\n)*)/gm)) {
    const needs = block.match(/^ {4}needs: (.+)$/m)?.[1] ?? ''
    result.set(name, {
      block,
      needs: needs
        .replace(/[[\]]/g, '')
        .split(',')
        .map((need) => need.trim())
        .filter(Boolean),
    })
  }
  return result
}

test.group('release workflow', () => {
  // A release started from another branch must stop before the checks spend their minutes.
  test('every release job waits for the main-only guard', async ({ assert }) => {
    const workflow = await readFile(workflowPath, 'utf8')
    const all = jobs(workflow)
    assert.match(all.get('guard')?.block ?? '', /run: test "\$GITHUB_REF" = "refs\/heads\/main"/)
    const guarded = (job: string): boolean =>
      (all.get(job)?.needs ?? []).some((need) => need === 'guard' || guarded(need))
    const unguarded = [...all.keys()].filter((job) => job !== 'guard' && !guarded(job))
    assert.isAbove(all.size, 1)
    assert.deepEqual(unguarded, [])
  })

  // Install and build scripts run dependency code; none of it may hold a token that can
  // create releases or push tags.
  test('only the job that creates the release can write, and it runs no repository code', async ({
    assert,
  }) => {
    const workflow = await readFile(workflowPath, 'utf8')
    // The top-level grant is read-only and has no other keys.
    assert.match(workflow, /^permissions:\n {2}contents: read\n(?! )/m)
    // A job writes if its `permissions` key holds `write` inline or on any nested line.
    const writers = [...jobs(workflow)].filter(([, job]) =>
      /^ {4}permissions:(?:.*write|\n(?: {6}.*\n)*? {6}\S+: write)/m.test(job.block)
    )
    assert.lengthOf(writers, 1)
    const [, release] = writers[0]
    // Two steps only: the artifact download and the release command. Named steps put `uses`
    // and `run` on the line after the dash, so both forms count.
    assert.lengthOf(release.block.match(/^ {6}- /gm) ?? [], 2)
    const uses = [...release.block.matchAll(/^(?: {6}- | {8})uses: (.+)$/gm)].map(([, u]) => u)
    assert.lengthOf(uses, 1)
    assert.match(uses[0], /^actions\/download-artifact@/)
    const runs = [...release.block.matchAll(/^(?: {6}- | {8})run: (.+)$/gm)].map(([, r]) => r)
    assert.lengthOf(runs, 1)
    assert.match(runs[0], /^gh release create /)
  })
})

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
    assert.match(workflow, /^permissions:\n {2}contents: read$/m)
    const writers = [...jobs(workflow)].filter(([, job]) =>
      /^ {4}permissions:\n(?: {6}.*\n)*? {6}contents: write$/m.test(job.block)
    )
    assert.lengthOf(writers, 1)
    const [, release] = writers[0]
    const steps = [...release.block.matchAll(/^ {6}- (?:uses|run): (.+)$/gm)].map(
      ([, step]) => step
    )
    assert.lengthOf(steps, 1)
    assert.match(steps[0], /^actions\/download-artifact@/)
    const runs = [...release.block.matchAll(/^ {8}run: (.+)$/gm)].map(([, run]) => run)
    assert.lengthOf(runs, 1)
    assert.match(runs[0], /^gh release create /)
    assert.notInclude(release.block, 'actions/checkout')
    assert.notInclude(release.block, 'pnpm')
  })
})

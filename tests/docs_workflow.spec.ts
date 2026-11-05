/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs'
import { test } from '@japa/runner'

const workflow = readFileSync(new URL('../.github/workflows/docs.yml', import.meta.url), 'utf8')

test('pull request docs builds do not share the Pages deployment concurrency group', ({
  assert,
}) => {
  const group = workflow.match(/^concurrency:\n(?:\s+#.*\n)*\s+group: (.+)$/m)?.[1]
  // The same expression as Account Kit's docs workflow: one queue per PR, deployments share 'pages'.
  assert.equal(
    group,
    "${{ github.event_name == 'pull_request' && format('pages-pr-{0}', github.event.pull_request.number) || 'pages' }}"
  )
})

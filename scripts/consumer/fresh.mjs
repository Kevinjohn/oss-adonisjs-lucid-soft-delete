/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { runConsumerApp } from './consumer_app.mjs'

/** Current compatible AdonisJS and Lucid peer releases. */
export function runFresh(archive) {
  return runConsumerApp(archive, 'latest')
}

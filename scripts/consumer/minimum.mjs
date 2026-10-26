/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { runConsumerApp } from './consumer_app.mjs'

/** Exact minimum AdonisJS and Lucid peers declared by the package. */
export function runMinimum(archive) {
  return runConsumerApp(archive, 'minimum')
}

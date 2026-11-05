/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import type { ApplicationService } from '@adonisjs/core/types'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import LucidSoftDeletesProvider from '../providers/lucid_soft_delete_provider.js'

test.group('Provider', () => {
  test('boot installs the lifecycle macros on the Lucid model query builder', async ({
    assert,
  }) => {
    // A fresh subclass: other specs already install the macros on the shared prototype.
    class Builder extends ModelQueryBuilder {}
    const requested: string[] = []
    const app = {
      import: async (specifier: string) => {
        requested.push(specifier)
        return { ModelQueryBuilder: Builder }
      },
    } as unknown as ApplicationService

    await new LucidSoftDeletesProvider(app).boot()

    assert.deepEqual(requested, ['@adonisjs/lucid/orm'])
    for (const name of ['restore', 'softDelete', 'forceDelete', 'withTrashed', 'onlyTrashed']) {
      assert.isTrue(Object.hasOwn(Builder.prototype, name), name)
    }
  })
})

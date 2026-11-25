/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import assert from 'node:assert/strict'
import { Application } from '@adonisjs/core/app'
import { Emitter } from '@adonisjs/core/events'
import { LoggerFactory } from '@adonisjs/core/factories/logger'
import { compose } from '@adonisjs/core/helpers'
import { Database } from '@adonisjs/lucid/database'
import { BaseModel, ModelQueryBuilder, column } from '@adonisjs/lucid/orm'
import { withSoftDeletes } from '../../index.ts'

const app = new Application(new URL('.', import.meta.url), {
  environment: 'test',
  importer: (specifier) => import(specifier),
}).rcContents({
  providers: [() => import('../../providers/lucid_soft_delete_provider.ts')],
})
const macros = ['withTrashed', 'onlyTrashed', 'softDelete', 'restore', 'forceDelete'] as const

for (const macro of macros) {
  assert.equal(typeof ModelQueryBuilder.prototype[macro], 'undefined', `${macro} before app boot`)
}

const db = new Database(
  {
    connection: 'sqlite',
    connections: { sqlite: { client: 'better-sqlite3', connection: { filename: ':memory:' } } },
  },
  new LoggerFactory().create(),
  new Emitter(app)
)
BaseModel.useAdapter(db.modelAdapter())

export default class Record extends compose(BaseModel, withSoftDeletes) {
  @column({ isPrimary: true })
  declare id: number
}

try {
  await app.init()
  await app.boot()

  const builder = Record.query()
  for (const macro of macros) {
    assert.equal(typeof builder[macro], 'function', `${macro} after app boot`)
  }

  await db.connection().schema.createTable('records', (table) => {
    table.increments('id')
    table.timestamp('deleted_at').nullable()
  })
  await db.table('records').insert({ id: 1, deleted_at: null })

  assert.equal(await Record.query().where('id', 1).softDelete(), 1)
  assert.deepEqual(await Record.query(), [])
  const included = await Record.query().withTrashed().firstOrFail()
  const trashed = await Record.query().onlyTrashed().firstOrFail()
  assert.equal(included.id, 1)
  assert.equal(trashed.id, 1)
  assert.equal(await Record.query().where('id', 1).restore(), 1)
  const restored = await Record.query().firstOrFail()
  assert.equal(restored.id, 1)
  assert.equal(await Record.query().where('id', 1).forceDelete(), 1)
  assert.deepEqual(await Record.query().withTrashed(), [])
} finally {
  await db.manager.closeAll()
  await app.terminate()
}

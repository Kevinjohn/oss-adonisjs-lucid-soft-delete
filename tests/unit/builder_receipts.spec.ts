/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file included with this source code.
 */

import { compose } from '@adonisjs/core/helpers'
import {
  BaseModel,
  beforeDelete,
  beforeFetch,
  beforeUpdate,
  column,
  ModelQueryBuilder,
} from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import { DateTime, Settings } from 'luxon'
import { getActiveTest } from '@japa/runner'
import type { PostgreConfig, SqliteConfig } from '@adonisjs/lucid/types/database'
import { dirname, join } from 'node:path'
import {
  E_BULK_RECEIPT_DIVERGED,
  E_BULK_RECEIPT_REQUIRES_TRANSACTION,
  E_BULK_RECEIPT_UNSUPPORTED,
  SoftDeletes,
} from '../../index.js'
import { extendModelQueryBuilder } from '../../src/bindings/model_query_builder.js'
import { executeWithReceipt } from '../../src/receipts.js'
import { createDatabase, createTables, dbClient } from '../helpers.js'
import { CustomPost, RelationPost, RelationUser } from '../fixtures/models.js'

class LifecycleUser extends compose(BaseModel, SoftDeletes) {
  static table = 'users'
  static hooksRun = 0
  @column({ isPrimary: true }) declare id: number
  @column() declare username: string
  @column() declare companyId: number
  @column.dateTime() declare updatedAt: DateTime
  @beforeDelete()
  @beforeUpdate()
  static trackHook() {
    this.hooksRun++
  }
}

class HandleUser extends compose(BaseModel, SoftDeletes) {
  static table = 'users'
  static primaryKey = 'handle'
  @column({ isPrimary: true, columnName: 'username' }) declare handle: string
  @column() declare companyId: number
}

class BigKey extends compose(BaseModel, SoftDeletes) {
  static table = 'big_keys'
  @column({ isPrimary: true }) declare id: number | string
  @column() declare label: string
}

class FetchUser extends LifecycleUser {
  static table = 'users'
  static fetchHooksRun = 0
  @beforeFetch()
  static trackFetch() {
    this.fetchHooksRun++
  }
}

async function openTransaction(db: Awaited<ReturnType<typeof createDatabase>>) {
  const trx = await db.transaction()
  getActiveTest()?.cleanup(async () => {
    if (!trx.isCompleted) await trx.rollback()
  })
  return trx
}

async function inTransaction<T>(
  db: Awaited<ReturnType<typeof createDatabase>>,
  run: (trx: Awaited<ReturnType<typeof db.transaction>>) => Promise<T>,
  commit = true
) {
  const trx = await openTransaction(db)
  const testContext = getActiveTest()
  testContext?.cleanup(async () => {
    if (!trx.isCompleted) await trx.rollback()
  })
  try {
    const result = await run(trx)
    if (commit) await trx.commit()
    else await trx.rollback()
    return result
  } catch (error) {
    if (!trx.isCompleted) await trx.rollback()
    throw error
  }
}

test.group('Builder receipts', (group) => {
  group.setup(() => extendModelQueryBuilder(ModelQueryBuilder))

  test('count mode is unchanged by the receipt code path', async ({ assert }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql.toLowerCase()))
    await createTables(db)
    for (const entry of ['outside', 'inside'] as const) {
      const user = await LifecycleUser.create({ username: `count-${entry}` })
      const trx = entry === 'inside' ? await openTransaction(db) : undefined
      const calls = [
        (client?: typeof trx) =>
          LifecycleUser.query(client ? { client } : {})
            .where('id', user.id)
            .softDelete(),
        (client?: typeof trx) =>
          LifecycleUser.query(client ? { client } : {})
            .where('id', user.id)
            .restore(),
        (client?: typeof trx) =>
          LifecycleUser.query(client ? { client } : {})
            .where('id', user.id)
            .forceDelete(),
      ]
      for (const call of calls) {
        const start = statements.length
        const result = await call(trx)
        assert.typeOf(result, 'number')
        assert.lengthOf(statements.slice(start), 1)
        assert.notInclude(statements.slice(start)[0], 'select')
      }
      if (trx) await trx.rollback()
    }
  })

  test('zero, one and many rows per operation with ids as a set', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await inTransaction(db, async (trx) => {
      await trx
        .table('users')
        .insert([
          { username: 'receipt-one' },
          { username: 'receipt-two' },
          { username: 'receipt-three' },
        ])
      const rows = await LifecycleUser.query({ client: trx }).orderBy('id')
      const empty = await LifecycleUser.query({ client: trx })
        .where('id', -1)
        .softDelete({ receipt: true })
      assert.deepEqual(empty, { count: 0, ids: [], deletedAt: null })
      const one = await LifecycleUser.query({ client: trx })
        .where('id', rows[0].id)
        .softDelete({ receipt: true })
      assert.equal(one.count, 1)
      assert.sameMembers(one.ids, [rows[0].id])
      assert.isTrue(DateTime.isDateTime(one.deletedAt))
      assert.equal(one.count, one.ids.length)
      const many = await LifecycleUser.query({ client: trx })
        .whereIn('id', [rows[1].id, rows[2].id])
        .withTrashed()
        .softDelete({ receipt: true })
      assert.equal(many.count, 2)
      assert.sameMembers(many.ids, [rows[1].id, rows[2].id])
      assert.equal(many.count, many.ids.length)
      const restored = await LifecycleUser.query({ client: trx })
        .whereIn(
          'id',
          rows.map((row) => row.id)
        )
        .restore({ receipt: true })
      assert.equal(restored.count, 3)
      assert.sameMembers(
        restored.ids,
        rows.map((row) => row.id)
      )
      assert.equal(restored.count, restored.ids.length)
      await LifecycleUser.query({ client: trx })
        .whereIn('id', [rows[0].id, rows[1].id])
        .softDelete()
      const purged = await LifecycleUser.query({ client: trx })
        .whereIn('id', [rows[0].id, rows[1].id])
        .onlyTrashed()
        .forceDelete({ receipt: true })
      assert.equal(purged.count, 2)
      assert.sameMembers(purged.ids, [rows[0].id, rows[1].id])
      assert.equal(purged.count, purged.ids.length)
    })
  })

  test('onlyTrashed softDelete returns an empty receipt without a statement', async ({
    assert,
  }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql))
    await createTables(db)
    const user = await LifecycleUser.create({ username: 'only-empty' })
    const trx = await openTransaction(db)
    const start = statements.length
    const result = await LifecycleUser.query({ client: trx })
      .where('id', user.id)
      .onlyTrashed()
      .softDelete({ receipt: true })
    assert.deepEqual(result, { count: 0, ids: [], deletedAt: null })
    assert.lengthOf(statements.slice(start), 0)
    await trx.rollback()
  })

  test("deletedAt equals the stored value at the dialect's precision", async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const previousNow = Settings.now
    Settings.now = () => Date.UTC(2026, 9, 27, 12, 30, 0, 789)
    try {
      const row = await LifecycleUser.create({ username: 'timestamp-precision' })
      const trx = await openTransaction(db)
      const receipt = await LifecycleUser.query({ client: trx })
        .where('id', row.id)
        .softDelete({ receipt: true })
      const fetched = await LifecycleUser.query({ client: trx })
        .withTrashed()
        .where('id', row.id)
        .firstOrFail()
      assert.equal(fetched.deletedAt!.toMillis(), receipt.deletedAt!.toMillis())
      assert.equal(receipt.deletedAt!.millisecond, dbClient === 'pg' ? 789 : 0)
      await trx.rollback()
    } finally {
      Settings.now = previousNow
    }
  })

  test('mixed active and trashed selections and tenant predicates', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const users = await LifecycleUser.createMany([
      { username: 'tenant-one-active', companyId: 1 },
      { username: 'tenant-one-trashed', companyId: 1 },
      { username: 'tenant-two-active', companyId: 2 },
      { username: 'tenant-two-trashed', companyId: 2 },
    ])
    await LifecycleUser.query().where('id', users[1].id).softDelete()
    await LifecycleUser.query().where('id', users[3].id).softDelete()
    const trx = await openTransaction(db)
    const deleted = await LifecycleUser.query({ client: trx })
      .where('company_id', 1)
      .softDelete({ receipt: true })
    assert.sameMembers(deleted.ids, [users[0].id])
    const restored = await LifecycleUser.query({ client: trx })
      .where('company_id', 1)
      .restore({ receipt: true })
    assert.sameMembers(restored.ids, [users[0].id, users[1].id])
    await LifecycleUser.query({ client: trx })
      .whereIn('id', [users[0].id, users[1].id])
      .softDelete()
    const purged = await LifecycleUser.query({ client: trx })
      .where('company_id', 1)
      .onlyTrashed()
      .forceDelete({ receipt: true })
    assert.sameMembers(purged.ids, [users[0].id, users[1].id])
    const otherTenant = await trx.from('users').where('company_id', 2)
    assert.lengthOf(otherTenant, 2)
    assert.isNull(otherTenant[0].deleted_at)
    assert.isNotNull(otherTenant[1].deleted_at)
    await trx.rollback()
  })

  test('grouped OR, whereIn and an aliased base table', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const rows = await LifecycleUser.createMany([
      { username: 'group-a', companyId: 1 },
      { username: 'group-b', companyId: 1 },
      { username: 'group-other', companyId: 2 },
      { username: 'group-unmatched', companyId: 1 },
    ])
    const trx = await openTransaction(db)
    const query = LifecycleUser.query({ client: trx })
      .from('users as selected')
      .where('company_id', 1)
      .whereIn(
        'id',
        rows.slice(0, 3).map((row) => row.id)
      )
      .where((nested) => nested.where('username', 'group-a').orWhere('username', 'group-b'))
    const receipt = await query.softDelete({ receipt: true })
    assert.sameMembers(receipt.ids, [rows[0].id, rows[1].id])
    assert.lengthOf(await trx.from('users').whereNull('deleted_at'), 2)
    const purged = await LifecycleUser.query({ client: trx })
      .from('users as selected')
      .whereIn('id', receipt.ids)
      .onlyTrashed()
      .forceDelete({ receipt: true })
    assert.equal(purged.count, 2)
    assert.sameMembers(purged.ids, receipt.ids)
    await trx.rollback()
  })

  test('custom primary key attribute mapped to a different column', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await HandleUser.createMany([
      { handle: 'one', companyId: 1 },
      { handle: 'two', companyId: 1 },
    ])
    const trx = await openTransaction(db)
    const receipt = await HandleUser.query({ client: trx }).softDelete({ receipt: true })
    assert.sameMembers(receipt.ids, ['one', 'two'])
    await trx.rollback()
  })

  test('bigint primary keys keep driver precision', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const id = dbClient === 'pg' ? '9007199254740993' : '4000000000'
    await db.table('big_keys').insert({ id, label: 'precision' })
    const trx = await openTransaction(db)
    const receipt = await BigKey.query({ client: trx }).softDelete({ receipt: true })
    assert.deepEqual(receipt.ids, dbClient === 'pg' ? ['9007199254740993'] : [4000000000])
    await trx.rollback()
  })

  test('renamed deletedAt column and bypassed prepare', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await db.table('posts').insert({ title: 'custom-receipt' })
    const trx = await openTransaction(db)
    const deleted = await CustomPost.query({ client: trx }).softDelete({ receipt: true })
    assert.equal(deleted.count, 1)
    const row = await trx.from('posts').firstOrFail()
    assert.isNotNull(row.deletedAt)
    assert.isNull(row.deleted_at)
    const purged = await CustomPost.query({ client: trx })
      .onlyTrashed()
      .forceDelete({ receipt: true })
    assert.equal(purged.count, 1)
    await trx.rollback()
  })

  test('hooks, updatedAt and fetch hooks stay untouched', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const users = await FetchUser.createMany([
      { username: 'hooks-receipt-update' },
      { username: 'hooks-receipt-delete' },
    ])
    const stamp = DateTime.utc(2020, 1, 1).toFormat(db.connection().dialect.dateTimeFormat)
    await db.from('users').update({ updated_at: stamp })
    const before = await db.from('users').where('id', users[0].id).firstOrFail()
    LifecycleUser.hooksRun = 0
    FetchUser.hooksRun = 0
    FetchUser.fetchHooksRun = 0
    const trx = await openTransaction(db)
    await FetchUser.query({ client: trx }).where('id', users[0].id).softDelete({ receipt: true })
    await FetchUser.query({ client: trx }).where('id', users[0].id).restore({ receipt: true })
    await FetchUser.query({ client: trx }).where('id', users[1].id).forceDelete({ receipt: true })
    assert.equal(LifecycleUser.hooksRun, 0)
    assert.equal(FetchUser.hooksRun, 0)
    assert.equal(FetchUser.fetchHooksRun, 0)
    const persisted = await trx.from('users').where('id', users[0].id).firstOrFail()
    assert.equal(String(persisted.updated_at), String(before.updated_at))
    assert.isNull(await trx.from('users').where('id', users[1].id).first())
    await trx.rollback()
  })

  test('default-mode restore selects trashed rows on the preselect path', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const rows = await LifecycleUser.createMany([
      { username: 'restore-a' },
      { username: 'restore-b' },
      { username: 'restore-active' },
    ])
    await LifecycleUser.query().whereIn('id', [rows[0].id, rows[1].id]).softDelete()
    const trx = await openTransaction(db)
    const receipt = await LifecycleUser.query({ client: trx }).restore({ receipt: true })
    assert.equal(receipt.count, 2)
    assert.sameMembers(receipt.ids, [rows[0].id, rows[1].id])
    await trx.rollback()
  }).skip(dbClient === 'pg', 'single-statement RETURNING path')

  test('reused, cloned and mode-switched builders', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const row = await LifecycleUser.create({ username: 'reuse-receipt' })
    const trx = await openTransaction(db)
    const builder = LifecycleUser.query({ client: trx }).where('id', row.id)
    const first = await builder.softDelete({ receipt: true })
    assert.equal(first.count, 1)
    assert.deepEqual(await builder.softDelete({ receipt: true }), {
      count: 0,
      ids: [],
      deletedAt: null,
    })
    assert.lengthOf(builder.toQuery().match(/is null/gi) || [], 1)
    const cloned = await builder.clone().softDelete({ receipt: true })
    assert.equal(cloned.count, 0)
    assert.equal(await builder.softDelete(), 0)
    const purged = await builder.onlyTrashed().forceDelete({ receipt: true })
    assert.equal(purged.count, 1)
    const withTrashed = builder.withTrashed()
    const empty = await withTrashed.forceDelete({ receipt: true })
    assert.equal(empty.count, 0)
    const sql = withTrashed.toQuery()
    const whereIndex = sql.toLowerCase().lastIndexOf(' where ')
    assert.isAbove(whereIndex, -1)
    assert.notInclude(sql.slice(whereIndex + ' where '.length), 'deleted_at')
    await trx.table('users').insert({ username: 'reuse-count-first' })
    const second = await LifecycleUser.query({ client: trx })
      .where('username', 'reuse-count-first')
      .firstOrFail()
    const reverse = LifecycleUser.query({ client: trx }).where('id', second.id)
    assert.equal(await reverse.softDelete(), 1)
    const secondReceipt = await reverse.softDelete({ receipt: true })
    assert.equal(secondReceipt.count, 0)
    await trx.rollback()
  })

  test('has-many builders retain the parent predicate; other relation shapes reject', async ({
    assert,
  }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql.toLowerCase()))
    await createTables(db)
    const parent = await RelationUser.create({ username: 'receipt-parent' })
    const other = await RelationUser.create({ username: 'receipt-other' })
    const posts = await RelationPost.createMany([
      { userId: parent.id, title: 'selected' },
      { userId: other.id, title: 'other' },
    ])
    const trx = await openTransaction(db)
    const related = () => parent.related('posts').query().useTransaction(trx)
    const first = await related().softDelete({ receipt: true })
    assert.equal(first.count, 1)
    assert.sameMembers(first.ids, [posts[0].id])
    const second = await related().softDelete({ receipt: true })
    assert.equal(second.count, 0)
    const start = statements.length
    await assert.rejects(
      () => parent.related('profile').query().useTransaction(trx).softDelete({ receipt: true }),
      E_BULK_RECEIPT_UNSUPPORTED
    )
    assert.lengthOf(statements.slice(start), 0)
    await assert.rejects(
      () => posts[0].related('user').query().useTransaction(trx).softDelete({ receipt: true }),
      E_BULK_RECEIPT_UNSUPPORTED
    )
    await assert.rejects(
      () => parent.related('industries').query().useTransaction(trx).softDelete({ receipt: true }),
      /many-to-many/
    )
    await assert.rejects(
      () => parent.related('comments').query().useTransaction(trx).softDelete({ receipt: true }),
      /has-many-through/
    )
    const persisted = await trx.from('posts').where('id', posts[1].id).firstOrFail()
    assert.isNull(persisted.deleted_at)
    await trx.rollback()
  })

  test('unsupported query shapes reject before any statement', async ({ assert }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql))
    await createTables(db)
    const trx = await openTransaction(db)
    const base = LifecycleUser.query({ client: trx })
    const shapes: Array<(query: typeof base) => typeof base> = [
      (q) => q.join('posts', 'posts.user_id', 'users.id'),
      (q) => q.groupBy('id'),
      (q) => q.orderBy('id'),
      (q) => q.limit(1),
      (q) => q.offset(1),
      (q) => q.count('* as total'),
      (q) => q.from(db.from('users').as('sub')),
    ]
    for (const shape of shapes) {
      const start = statements.length
      await assert.rejects(
        () => shape(LifecycleUser.query({ client: trx })).softDelete({ receipt: true }),
        E_BULK_RECEIPT_UNSUPPORTED
      )
      assert.lengthOf(statements.slice(start), 0)
    }
    await trx.rollback()
  })

  test('receipt mode requires a transaction on every dialect', async ({ assert, cleanup }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql))
    await createTables(db)
    const user = await LifecycleUser.create({ username: 'transaction-required' })
    const start = statements.length
    await assert.rejects(
      () => LifecycleUser.query().where('id', user.id).softDelete({ receipt: true }),
      E_BULK_RECEIPT_REQUIRES_TRANSACTION
    )
    assert.lengthOf(statements.slice(start), 0)
    const unchanged = await db.from('users').where('id', user.id).firstOrFail()
    assert.isNull(unchanged.deleted_at)
    for (const mode of ['client', 'useTransaction'] as const) {
      const trx = await openTransaction(db)
      cleanup(async () => {
        if (!trx.isCompleted) await trx.rollback()
      })
      const query =
        mode === 'client'
          ? LifecycleUser.query({ client: trx })
          : LifecycleUser.query().useTransaction(trx)
      const receipt = await query.where('id', user.id).softDelete({ receipt: true })
      assert.equal(receipt.count, 1)
      await trx.rollback()
    }
    await db.beginGlobalTransaction()
    cleanup(async () => {
      await db.rollbackGlobalTransaction().catch(() => {})
    })
    const receipt = await LifecycleUser.query().where('id', user.id).softDelete({ receipt: true })
    assert.equal(receipt.count, 1)
    await db.rollbackGlobalTransaction()
  })

  test('options are validated', async ({ assert }) => {
    const statements: string[] = []
    const db = await createDatabase((event) => statements.push(event.sql))
    await createTables(db)
    const user = await LifecycleUser.create({ username: 'options' })
    const trx = await openTransaction(db)
    for (const options of ['yes', { reciept: true }, { receipt: 'true' }, []] as unknown[]) {
      const start = statements.length
      await assert.rejects(
        () =>
          LifecycleUser.query({ client: trx })
            .where('id', user.id)
            .softDelete(options as never),
        TypeError
      )
      assert.lengthOf(statements.slice(start), 0)
    }
    assert.typeOf(
      await LifecycleUser.query({ client: trx }).where('id', user.id).softDelete({}),
      'number'
    )
    assert.typeOf(
      await LifecycleUser.query({ client: trx })
        .where('id', user.id)
        .softDelete({ receipt: false }),
      'number'
    )
    await trx.rollback()
  })

  test('commit persists and rollback reverts a receipted write', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    for (const entry of ['client', 'useTransaction'] as const) {
      for (const action of ['softDelete', 'restore', 'forceDelete'] as const) {
        for (const commit of [false, true]) {
          const row = await LifecycleUser.create({
            username: `commit-rollback-${entry}-${action}-${commit}`,
          })
          if (action !== 'softDelete') await LifecycleUser.query().where('id', row.id).softDelete()
          const trx = await openTransaction(db)
          const query =
            entry === 'client'
              ? LifecycleUser.query({ client: trx })
              : LifecycleUser.query().useTransaction(trx)
          const receipt = await query.where('id', row.id)[action]({ receipt: true })
          assert.equal(receipt.count, 1)
          const inside = await trx.from('users').where('id', row.id).first()
          if (action === 'forceDelete') assert.isNull(inside)
          else assert.equal(inside?.deleted_at !== null, action === 'softDelete')
          if (commit) await trx.commit()
          else await trx.rollback()
          const persisted = await db.from('users').where('id', row.id).first()
          if (action === 'forceDelete') assert.equal(persisted !== null, !commit)
          else
            assert.equal(persisted?.deleted_at !== null, action === 'softDelete' ? commit : !commit)
        }
      }
    }
  })

  test('named connections', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const primaryConfig = db.config.connections[db.primaryConnectionName]
    if (!primaryConfig) throw new Error('Primary database connection is missing')
    const secondaryConfig = structuredClone(primaryConfig)
    if (dbClient === 'pg') {
      await db.rawQuery('DROP SCHEMA IF EXISTS second CASCADE').exec()
      await db.rawQuery('CREATE SCHEMA second').exec()
      ;(secondaryConfig as PostgreConfig).searchPath = ['second']
    } else if (dbClient === 'mysql') {
      await db.rawQuery('DROP DATABASE IF EXISTS lucid_soft_deletes_second').exec()
      await db.rawQuery('CREATE DATABASE lucid_soft_deletes_second').exec()
      const mysqlConfig = secondaryConfig as { connection: { database?: string } }
      mysqlConfig.connection = { ...mysqlConfig.connection, database: 'lucid_soft_deletes_second' }
    } else {
      const sqliteConfig = secondaryConfig as SqliteConfig
      if (typeof sqliteConfig.connection === 'string')
        throw new Error('Expected SQLite connection options')
      sqliteConfig.connection.filename = join(
        dirname(sqliteConfig.connection.filename),
        'secondary.sqlite3'
      )
    }
    db.manager.add('secondary', secondaryConfig)
    await db.manager.connect('secondary')
    await db.table('users').insert({ id: 10, username: 'secondary', deleted_at: null })
    await db.connection('secondary').schema.createTable('users', (table) => {
      table.increments()
      table.string('username')
      table.timestamp('deleted_at', { useTz: true })
    })
    await db
      .connection('secondary')
      .table('users')
      .insert({ id: 10, username: 'secondary', deleted_at: null })
    const trx = await db.connection('secondary').transaction()
    getActiveTest()?.cleanup(async () => {
      if (!trx.isCompleted) await trx.rollback()
    })
    const receipt = await LifecycleUser.query({ connection: 'secondary', client: trx })
      .where('id', 10)
      .softDelete({ receipt: true })
    assert.equal(receipt.count, 1)
    const primaryRow = await db.from('users').where('username', 'secondary').firstOrFail()
    assert.isNull(primaryRow.deleted_at)
    await trx.rollback()
    if (dbClient === 'pg') await db.rawQuery('DROP SCHEMA second CASCADE').exec()
    else if (dbClient === 'mysql')
      await db.rawQuery('DROP DATABASE lucid_soft_deletes_second').exec()
  })

  test('database failures propagate and leave no partial receipt', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    await db
      .connection()
      .rawQuery('PRAGMA foreign_keys = ON')
      .catch(() => {})
    await db.table('books').insert({ id: 1, name: 'receipt-book' })
    await db.table('authors').insert({ id: 1, name: 'receipt-author' })
    await db.table('author_book').insert({ book_id: 1, author_id: 1 })
    class Book extends compose(BaseModel, SoftDeletes) {
      static table = 'books'
      @column({ isPrimary: true }) declare id: number
    }
    const trx = await openTransaction(db)
    await assert.rejects(() => Book.query({ client: trx }).forceDelete({ receipt: true }))
    await trx.rollback()
    assert.lengthOf(await db.from('books'), 1)
  })

  test('the divergence guard throws with both counts', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const rows = await LifecycleUser.createMany([
      { username: 'diverge-a' },
      { username: 'diverge-b' },
    ])
    const trx = await openTransaction(db)
    const query = LifecycleUser.query({ client: trx }).whereIn(
      'id',
      rows.map((row) => row.id)
    )
    let caught: unknown
    try {
      await executeWithReceipt(query, async (target) => {
        await target.update({ deleted_at: '2026-10-27 00:00:00' } as never)
        return [0]
      })
    } catch (error) {
      caught = error
    }
    assert.instanceOf(caught, E_BULK_RECEIPT_DIVERGED)
    assert.equal((caught as E_BULK_RECEIPT_DIVERGED).expected, 2)
    assert.equal((caught as E_BULK_RECEIPT_DIVERGED).actual, 0)
    await trx.rollback()
    assert.lengthOf(await db.from('users').whereNull('deleted_at'), 2)
  }).skip(dbClient === 'pg', 'single-statement RETURNING path')

  test('MySQL: a predicate that changes between select and write diverges', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const trx = await openTransaction(db)
    await trx.rawQuery('SET @n = 0')
    await trx
      .table('users')
      .insert([{ username: 'mysql-diverge-a' }, { username: 'mysql-diverge-b' }])
    let caught: unknown
    try {
      await LifecycleUser.query({ client: trx })
        .whereRaw('(@n := @n + 1) <= 2')
        .softDelete({ receipt: true })
    } catch (error) {
      caught = error
    }
    assert.instanceOf(caught, E_BULK_RECEIPT_DIVERGED)
    assert.equal((caught as E_BULK_RECEIPT_DIVERGED).expected, 2)
    assert.equal((caught as E_BULK_RECEIPT_DIVERGED).actual, 0)
    await trx.rollback()
    assert.lengthOf(await db.from('users').whereNull('deleted_at'), 2)
  }).skip(dbClient !== 'mysql')

  test('concurrent writer sees the committed receipt', async ({ assert }) => {
    const db = await createDatabase()
    await createTables(db)
    const rows = await LifecycleUser.createMany([
      { username: 'concurrent-a' },
      { username: 'concurrent-b' },
    ])
    const ids = rows.map((row) => row.id)
    const trxA = await openTransaction(db)
    const receipt = await LifecycleUser.query({ client: trxA })
      .whereIn('id', ids)
      .softDelete({ receipt: true })
    assert.equal(receipt.count, 2)
    const b = LifecycleUser.query().whereIn('id', ids).softDelete()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await trxA.commit()
    assert.equal(await b, 0)
    const persisted = await db.from('users').whereIn('id', ids)
    assert.lengthOf(persisted, 2)
    assert.isTrue(persisted.every((row) => row.deleted_at !== null))
    assert.isTrue(
      persisted.every((row) => String(row.deleted_at) === String(receipt.deletedAt!.toJSDate()))
    )
  }).skip(dbClient === 'sqlite', 'knex opens one SQLite connection')
})

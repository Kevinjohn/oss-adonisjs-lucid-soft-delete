/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import { createDatabase, createTables, dbClient } from './helpers.js'
import { RelationUser } from './fixtures/models.js'
import { getSoftDeletesMode, setSoftDeletesMode, SOFT_DELETES_MODE } from '../src/mode.js'
import { installModePropagation } from '../src/propagation.js'
import {
  aliasFromTable,
  qualifiedColumnReference,
  resolveTableReference,
} from '../src/table_reference.js'
import { addScopeFilter, removeScopeFilter } from '../src/where_stack.js'

test.group('scope modules', (group) => {
  group.setup(() => {
    installModePropagation(ModelQueryBuilder)
  })

  test('mode: defaults to default and is mirrored onto the Knex builder', ({ assert }) => {
    const knexQuery = {}
    const query = { knexQuery }
    assert.equal(getSoftDeletesMode(query), 'default')
    assert.strictEqual(setSoftDeletesMode(query, 'only'), query)
    assert.equal(getSoftDeletesMode(query), 'only')
    assert.equal(getSoftDeletesMode(knexQuery), 'only')
    assert.equal((knexQuery as Record<string, unknown>)[SOFT_DELETES_MODE], 'only')
    assert.equal(getSoftDeletesMode(setSoftDeletesMode({}, 'with')), 'with')
  })

  test('table reference: reads an alias from a string, an object, or neither', ({ assert }) => {
    assert.equal(aliasFromTable('posts as p'), 'p')
    assert.equal(aliasFromTable('posts AS P'), 'P')
    assert.equal(aliasFromTable('posts as user-rows'), 'user-rows')
    assert.equal(aliasFromTable('users as user.rows'), 'user.rows')
    assert.equal(aliasFromTable('posts AS u$'), 'u$')
    assert.equal(aliasFromTable('posts as   user-rows   '), 'user-rows')
    assert.equal(aliasFromTable({ p: 'posts' }), 'p')
    assert.equal(aliasFromTable({ 'user.rows': 'users' }), 'user.rows')
    assert.equal(aliasFromTable({ ' user.rows ': 'users' }), 'user.rows')
    assert.isUndefined(aliasFromTable('posts'))
    assert.isUndefined(aliasFromTable({ p: 'posts', q: 'users' }))
    assert.isUndefined(aliasFromTable({ p: 1 }))
    assert.isUndefined(aliasFromTable(['posts']))
    assert.isUndefined(aliasFromTable(undefined))
  })

  test('table reference: prefers tableAlias, then the from alias, then the model table', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    assert.equal(resolveTableReference(RelationUser.query()), 'users')
    assert.equal(resolveTableReference(RelationUser.query().from('users as u')), 'u')
    const aliased = RelationUser.query()
    ;(aliased as unknown as { tableAlias?: string }).tableAlias = 'alias'
    assert.equal(resolveTableReference(aliased), 'alias')
    assert.equal(
      resolveTableReference(RelationUser.query().from('users as user-rows')),
      'user-rows'
    )
  })

  test('qualified model tables scope real reads across schema and table identifiers', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    class SchemaQualifiedUser extends RelationUser {
      static table = `${
        dbClient === 'sqlite'
          ? 'main'
          : dbClient === 'pg'
            ? 'public'
            : (process.env.DB_DATABASE ?? 'lucid_soft_deletes_test')
      }.users`
    }

    await db
      .connection()
      .table('users')
      .insert([
        { username: 'active', email: 'active@example.test', deleted_at: null },
        {
          username: 'deleted',
          email: 'deleted@example.test',
          deleted_at: '2026-11-02 00:00:00',
        },
      ])

    const query = SchemaQualifiedUser.query()
    assert.equal(resolveTableReference(query), SchemaQualifiedUser.table)
    assert.equal(
      qualifiedColumnReference(query, 'deleted_at'),
      `${SchemaQualifiedUser.table}.deleted_at`
    )
    const rows = await query
    assert.deepEqual(
      rows.map((row) => row.username),
      ['active']
    )
  })

  test('qualified alias references follow Knex whitespace normalization', async ({ assert }) => {
    await createDatabase()

    const query = RelationUser.query().from({ ' user.rows ': 'users' })
    const reference = qualifiedColumnReference(query, ' deleted_at ')
    const knexQuery = query.knexQuery as unknown as {
      queryContext(): unknown
      client: {
        wrapIdentifier: (value: string, queryContext?: unknown) => string
      }
    }
    const context = knexQuery.queryContext()
    const wrappedReference = `${knexQuery.client.wrapIdentifier('user.rows', context)}.${knexQuery.client.wrapIdentifier('deleted_at', context)} is null`

    assert.include(query.whereNull(reference).toQuery(), wrappedReference)
  })

  test('qualified alias references use the query context identifier wrapper', async ({
    assert,
  }) => {
    await createDatabase()

    const query = RelationUser.query().from({ ' user.rows ': 'users' })
    const context = { identifierStyle: 'bracket' }
    const knexQuery = query.knexQuery as unknown as {
      queryContext(value: unknown): unknown
      client: {
        wrapIdentifier: (value: string, queryContext?: unknown) => string
      }
    }
    knexQuery.queryContext(context)

    const client = knexQuery.client
    const wrapIdentifier = client.wrapIdentifier
    const observedContexts: unknown[] = []
    client.wrapIdentifier = function (value, queryContext) {
      observedContexts.push(queryContext)
      if (queryContext === context) return `[${value}]`
      return wrapIdentifier.call(this, value, queryContext)
    }

    try {
      const reference = qualifiedColumnReference(query, 'deleted_at')
      const sql = query.whereNull(reference).toQuery()

      assert.include(sql, '[user.rows].[deleted_at] is null')
      assert.isTrue(observedContexts.includes(context))
    } finally {
      client.wrapIdentifier = wrapIdentifier
    }
  })

  test('where stack: one filter after the grouped predicates, replaced on rerun, removable', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const query = RelationUser.query().where('username', 'a').orWhere('username', 'b')
    addScopeFilter(query, 'whereNull', 'users.deleted_at')
    const once = query.toQuery()
    assert.match(once, /where \(.*username.*or.*username.*\) and .users.\..deleted_at. is null/)

    addScopeFilter(query, 'whereNotNull', 'users.deleted_at')
    const twice = query.toQuery()
    assert.equal(twice.match(/deleted_at/g)?.length, 1)
    assert.match(twice, /is not null/)
    assert.match(twice, /where \(.*username.*or.*username.*\) and/)

    removeScopeFilter(query)
    const removed = query.toQuery()
    assert.notMatch(removed, /deleted_at/)
    assert.match(removed, /where \(.*username.*or.*username.*\)/)

    const untouched = RelationUser.query().where('username', 'c')
    const before = untouched.toQuery()
    removeScopeFilter(untouched)
    assert.equal(untouched.toQuery(), before)
  })

  test('propagation: patches applyQueryFlags once and copies mode and alias to clones', async ({
    assert,
  }) => {
    const db = await createDatabase()
    await createTables(db)

    const prototype = ModelQueryBuilder.prototype as unknown as Record<string, unknown>
    const patched = prototype.applyQueryFlags
    installModePropagation(ModelQueryBuilder)
    assert.strictEqual(prototype.applyQueryFlags, patched)

    const query = RelationUser.query() as unknown as { tableAlias?: string } & ReturnType<
      typeof RelationUser.query
    >
    setSoftDeletesMode(query, 'only')
    query.tableAlias = 'u'
    const clone = query.clone() as unknown as { tableAlias?: string }
    assert.equal(getSoftDeletesMode(clone), 'only')
    assert.equal(clone.tableAlias, 'u')
  })
})

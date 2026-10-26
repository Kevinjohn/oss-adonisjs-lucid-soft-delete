/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getActiveTest, test } from '@japa/runner'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { createDatabase } from '../helpers.js'
import { SoftDeletes } from '../../src/mixin.js'

test.group('Cascade boundaries', () => {
  test('soft delete leaves relations intact and force delete follows foreign keys', async ({
    assert,
  }) => {
    const db = await createDatabase()
    const connection = db.connection()
    const isPostgres = process.env.DB_CLIENT === 'pg'

    if (!isPostgres) await db.rawQuery('PRAGMA foreign_keys = ON')

    const tables = ['parent_pivot', 'children_cascade', 'children_restrict', 'parents', 'tags']
    getActiveTest()?.cleanup(async () => {
      for (const table of tables) await connection.schema.dropTableIfExists(table)
    })

    await connection.schema.createTable('parents', (table) => {
      table.increments('id').primary()
      table.string('name').notNullable()
      table.timestamp('deleted_at', { useTz: true }).nullable()
    })
    await connection.schema.createTable('tags', (table) => {
      table.increments('id').primary()
      table.string('name').notNullable()
    })
    await connection.schema.createTable('parent_pivot', (table) => {
      table.integer('parent_id').notNullable().references('parents.id')
      table.integer('tag_id').notNullable().references('tags.id')
    })
    await connection.schema.createTable('children_restrict', (table) => {
      table.increments('id').primary()
      table.integer('parent_id').notNullable().references('parents.id')
    })
    await connection.schema.createTable('children_cascade', (table) => {
      table.increments('id').primary()
      table.integer('parent_id').notNullable().references('parents.id').onDelete('CASCADE')
    })

    class Parent extends compose(BaseModel, SoftDeletes) {
      static table = 'parents'

      @column({ isPrimary: true })
      declare id: number

      @column()
      declare name: string

      @column.dateTime({ columnName: 'deleted_at', serializeAs: null })
      declare deletedAt: import('luxon').DateTime | null

      @hasMany(() => RestrictChild, { foreignKey: 'parentId' })
      declare restrictChildren: HasMany<typeof RestrictChild>
    }

    class RestrictChild extends BaseModel {
      static table = 'children_restrict'

      @column({ isPrimary: true })
      declare id: number

      @column({ columnName: 'parent_id' })
      declare parentId: number
    }

    Parent.boot()
    RestrictChild.boot()

    await connection.table('parents').insert({ name: 'soft-deleted' })
    const softDeletedParentRow = await connection
      .from('parents')
      .where('name', 'soft-deleted')
      .first()
    const softDeletedParent = await Parent.findOrFail(softDeletedParentRow.id)
    await connection.table('tags').insert({ name: 'tag' })
    const tag = await connection.from('tags').where('name', 'tag').first()
    await connection
      .table('parent_pivot')
      .insert({ parent_id: softDeletedParent.id, tag_id: tag.id })
    await connection.table('children_restrict').insert({ parent_id: softDeletedParent.id })

    await softDeletedParent.delete()

    assert.isNotNull(await connection.from('parents').where('id', softDeletedParent.id).first())
    assert.lengthOf(await softDeletedParent.related('restrictChildren').query(), 1)
    assert.equal(
      await connection
        .from('children_restrict')
        .where('parent_id', softDeletedParent.id)
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      1
    )
    assert.equal(
      await connection
        .from('parent_pivot')
        .where('parent_id', softDeletedParent.id)
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      1
    )

    await connection.table('parents').insert({ name: 'restricted' })
    const restrictedParentRow = await connection.from('parents').where('name', 'restricted').first()
    const restrictedParent = await Parent.findOrFail(restrictedParentRow.id)
    await connection.table('children_restrict').insert({ parent_id: restrictedParent.id })
    let foreignKeyError: unknown
    try {
      await restrictedParent.forceDelete()
    } catch (error) {
      foreignKeyError = error
    }
    assert.exists(foreignKeyError)
    assert.equal(
      (foreignKeyError as { code?: string }).code,
      isPostgres ? '23503' : 'SQLITE_CONSTRAINT_FOREIGNKEY'
    )
    assert.isNotNull(await connection.from('parents').where('id', restrictedParent.id).first())

    await connection.table('parents').insert({ name: 'cascading' })
    const cascadingParentRow = await connection.from('parents').where('name', 'cascading').first()
    const cascadingParent = await Parent.findOrFail(cascadingParentRow.id)
    await connection.table('children_cascade').insert({ parent_id: cascadingParent.id })
    await cascadingParent.forceDelete()
    assert.isNull(await connection.from('parents').where('id', cascadingParent.id).first())
    assert.equal(
      await connection
        .from('children_cascade')
        .where('parent_id', cascadingParent.id)
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      0
    )
  })
})

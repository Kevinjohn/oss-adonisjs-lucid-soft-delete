/*
 * adonis-lucid-soft-deletes
 *
 * (c) Lookin Anton <alsd@lookinlab.ru>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getActiveTest } from '@japa/runner'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AppFactory } from '@adonisjs/core/factories/app'
import { LoggerFactory } from '@adonisjs/core/factories/logger'
import { Emitter } from '@adonisjs/core/events'
import { Database } from '@adonisjs/lucid/database'
import { BaseModel } from '@adonisjs/lucid/orm'

/**
 * Creates an instance of the database class for making queries
 */
export async function createDatabase() {
  const test = getActiveTest()
  if (!test) throw new Error('Cannot use "createDatabase" outside of a Japa test')

  const databaseDirectory = await mkdtemp(join(tmpdir(), 'lucid-soft-deletes-'))

  const app = new AppFactory().create(pathToFileURL(databaseDirectory), () => {})
  const logger = new LoggerFactory().create()
  const emitter = new Emitter(app)
  const db = new Database(
    {
      connection: process.env.DB_CLIENT === 'pg' ? 'pg' : 'sqlite',
      connections: {
        sqlite: {
          client: 'better-sqlite3',
          connection: {
            filename: join(databaseDirectory, 'db.sqlite3'),
          },
        },
        pg: {
          client: 'pg',
          connection: {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER || process.env.USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE || 'lucid_soft_deletes_test',
          },
        },
      },
    },
    logger,
    emitter
  )

  test.cleanup(async () => {
    await db.manager.closeAll()
    await rm(databaseDirectory, { recursive: true, force: true })
  })
  BaseModel.useAdapter(db.modelAdapter())
  return db
}

export async function createTables(db: Database) {
  const test = getActiveTest()
  if (!test) throw new Error('Cannot use "createTables" outside of a Japa test')

  test.cleanup(async () => {
    await db.connection().schema.dropTableIfExists('author_book')
    await db.connection().schema.dropTableIfExists('industry_user')
    await db.connection().schema.dropTableIfExists('books')
    await db.connection().schema.dropTableIfExists('authors')
    await db.connection().schema.dropTableIfExists('users')
    await db.connection().schema.dropTableIfExists('industries')
    await db.connection().schema.dropTableIfExists('roles')
    await db.connection().schema.dropTableIfExists('posts')
  })

  await db.connection().schema.createTable('users', (table) => {
    table.increments()
    table.string('username').unique()
    table.string('email').unique()
    table.boolean('is_admin')
    table.string('password')
    table.integer('company_id')
    table.timestamps()
    table.timestamp('deleted_at', { useTz: true })
  })

  await db.connection().schema.createTable('industries', (table) => {
    table.increments()
    table.string('title')
    table.string('text')
    table.integer('revenue')
    table.timestamps()
    table.timestamp('deleted_at', { useTz: true })
  })

  await db.connection().schema.createTable('books', (table) => {
    table.increments()
    table.string('name').unique()
    table.timestamps()
    table.timestamp('deleted_at', { useTz: true })
  })

  await db.connection().schema.createTable('authors', (table) => {
    table.increments()
    table.string('name')
    table.timestamps()
    table.timestamp('deleted_at', { useTz: true })
  })

  await db.connection().schema.createTable('roles', (table) => {
    table.increments()
    table.string('title')
    table.timestamps()
  })

  await db.connection().schema.createTable('industry_user', (table) => {
    table.increments()
    table.integer('user_id')
    table.integer('industry_id')
  })

  await db.connection().schema.createTable('author_book', (table) => {
    table.increments()
    table.integer('book_id')
    table.integer('author_id')
    table.foreign('book_id').references('books.id')
    table.foreign('author_id').references('authors.id')
    table.timestamp('deleted_at', { useTz: true })
  })

  await db.connection().schema.createTable('posts', (table) => {
    table.increments()
    table.string('title')
    table.timestamp('deletedAt', { useTz: true })
  })
}

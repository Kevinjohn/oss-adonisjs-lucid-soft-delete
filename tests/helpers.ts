import { getActiveTest } from '@japa/runner'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AppFactory } from '@adonisjs/core/factories/app'
import { LoggerFactory } from '@adonisjs/core/factories/logger'
import { Emitter } from '@adonisjs/core/events'
import { Database } from '@adonisjs/lucid/database'
import { BaseModel } from '@adonisjs/lucid/orm'
import type { PostgreConfig, SqliteConfig } from '@adonisjs/lucid/types/database'

const configuredDbClient = process.env.DB_CLIENT

if (
  configuredDbClient !== undefined &&
  !['pg', 'mysql2', 'better-sqlite3'].includes(configuredDbClient)
) {
  throw new Error(`Unsupported DB_CLIENT: ${configuredDbClient}; use pg, mysql2 or better-sqlite3`)
}

/** The database the suite runs against: `DB_CLIENT=pg`, `DB_CLIENT=mysql2`, or SQLite. */
export const dbClient: 'sqlite' | 'pg' | 'mysql' =
  configuredDbClient === 'pg' ? 'pg' : configuredDbClient === 'mysql2' ? 'mysql' : 'sqlite'

/**
 * Creates an instance of the database class for making queries
 */
export async function createDatabase(onQuery?: (event: { sql: string }) => void) {
  const test = getActiveTest()
  if (!test) throw new Error('Cannot use "createDatabase" outside of a Japa test')

  const databaseDirectory = await mkdtemp(join(tmpdir(), 'adonisjs-lucid-soft-delete-'))

  const app = new AppFactory().create(pathToFileURL(databaseDirectory), () => {})
  const logger = new LoggerFactory().create()
  const emitter = new Emitter(app)
  if (onQuery) emitter.on('db:query', onQuery)
  const db = new Database(
    {
      connection: dbClient,
      connections: {
        sqlite: {
          client: 'better-sqlite3',
          debug: true,
          connection: {
            filename: join(databaseDirectory, 'db.sqlite3'),
          },
        },
        pg: {
          client: 'pg',
          debug: true,
          connection: {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER || process.env.USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE || 'package_test',
          },
        },
        mysql: {
          client: 'mysql2',
          debug: true,
          connection: {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE || 'package_test',
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

  const ownedTables: string[] = []
  test.cleanup(async () => {
    for (const name of ownedTables.reverse()) {
      await db.connection().schema.dropTable(name)
    }
  })

  const createOwnedTable = async (
    ...args: Parameters<ReturnType<Database['connection']>['schema']['createTable']>
  ) => {
    const [name, definition] = args
    await db.connection().schema.createTable(name, definition)
    ownedTables.push(name)
  }

  await createOwnedTable('users', (table) => {
    table.increments()
    table.string('username').unique()
    table.string('email').unique()
    table.boolean('is_admin')
    table.string('password')
    table.integer('company_id')
    table.integer('manager_id')
    table.timestamps()
    table.timestamp('deleted_at', { useTz: true })
  })

  await createOwnedTable('industries', (table) => {
    table.increments()
    table.string('title')
    table.string('text')
    table.integer('revenue')
    table.timestamps()
    table.timestamp('deleted_at', { useTz: true })
  })

  await createOwnedTable('books', (table) => {
    table.increments()
    table.string('name').unique()
    table.timestamps()
    table.timestamp('deleted_at', { useTz: true })
  })

  await createOwnedTable('authors', (table) => {
    table.increments()
    table.string('name')
    table.timestamps()
    table.timestamp('deleted_at', { useTz: true })
  })

  await createOwnedTable('roles', (table) => {
    table.increments()
    table.string('title')
    table.timestamps()
  })

  await createOwnedTable('big_keys', (table) => {
    table.bigInteger('id').primary()
    table.string('label')
    table.timestamp('deleted_at', { useTz: true })
  })

  await createOwnedTable('industry_user', (table) => {
    table.increments()
    table.integer('user_id')
    table.integer('industry_id')
  })

  await createOwnedTable('author_book', (table) => {
    table.increments()
    table.integer('book_id').unsigned()
    table.integer('author_id').unsigned()
    table.foreign('book_id').references('books.id')
    table.foreign('author_id').references('authors.id')
    table.timestamp('deleted_at', { useTz: true })
  })

  await createOwnedTable('posts', (table) => {
    table.increments()
    table.string('title')
    table.integer('user_id')
    table.timestamp('deleted_at', { useTz: true })
    table.timestamp('deletedAt', { useTz: true })
  })

  await createOwnedTable('profiles', (table) => {
    table.increments()
    table.integer('user_id')
    table.string('display_name')
    table.timestamp('deleted_at', { useTz: true })
  })

  await createOwnedTable('comments', (table) => {
    table.increments()
    table.integer('post_id')
    table.string('body')
    table.timestamp('deleted_at', { useTz: true })
  })
}

/** Acquires a secondary test namespace and registers disposal before the caller can use it. */
export async function createSecondaryConnection(db: Database) {
  const test = getActiveTest()
  if (!test) throw new Error('Cannot use "createSecondaryConnection" outside of a Japa test')
  const primaryConfig = db.config.connections[db.primaryConnectionName]
  if (!primaryConfig) throw new Error('Primary database connection is missing')

  const secondaryConfig = structuredClone(primaryConfig)
  const namespace = `lucid_soft_delete_${randomUUID().replaceAll('-', '')}`
  if (dbClient === 'pg') {
    await db.rawQuery(`CREATE SCHEMA ${namespace}`).exec()
    ;(secondaryConfig as PostgreConfig).searchPath = [namespace]
  } else if (dbClient === 'mysql') {
    await db.rawQuery(`CREATE DATABASE ${namespace}`).exec()
    const mysqlConfig = secondaryConfig as { connection: { database?: string } }
    mysqlConfig.connection = { ...mysqlConfig.connection, database: namespace }
  } else {
    const sqliteConfig = secondaryConfig as SqliteConfig
    if (typeof sqliteConfig.connection === 'string') {
      throw new Error('Expected SQLite connection options')
    }
    sqliteConfig.connection.filename = join(
      dirname(sqliteConfig.connection.filename),
      'secondary.sqlite3'
    )
  }

  test.cleanup(async () => {
    await db.manager.close('secondary', true)
    if (dbClient === 'pg') await db.rawQuery(`DROP SCHEMA ${namespace} CASCADE`).exec()
    if (dbClient === 'mysql') await db.rawQuery(`DROP DATABASE ${namespace}`).exec()
  })
  db.manager.add('secondary', secondaryConfig)
  db.manager.connect('secondary')
  return db.connection('secondary')
}

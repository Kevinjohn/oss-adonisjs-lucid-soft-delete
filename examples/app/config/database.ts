/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const pgSchema = env.get('DB_SCHEMA')

const dbConfig = defineConfig({
  connection: env.get('DB_CLIENT') === 'pg' ? 'pg' : 'sqlite',
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      connection: {
        filename: env.get('DB_DATABASE'),
      },
      useNullAsDefault: true,
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
    pg: {
      client: 'pg',
      searchPath: pgSchema ? [pgSchema] : undefined,
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig

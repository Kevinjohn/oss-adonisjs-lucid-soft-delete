/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateRecoveryRecordsTable extends BaseSchema {
  protected tableName = 'recovery_records'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.integer('tenant_id').notNullable()
      table.integer('record_id').notNullable()
      table
        .uuid('group_id')
        .notNullable()
        .references('id')
        .inTable('recovery_groups')
        .onDelete('RESTRICT')
      table.timestamp('deleted_at').notNullable()
      table.primary(['tenant_id', 'record_id'])
      table.index(['tenant_id', 'group_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

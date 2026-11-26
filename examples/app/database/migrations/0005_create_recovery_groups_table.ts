/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateRecoveryGroupsTable extends BaseSchema {
  protected tableName = 'recovery_groups'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.integer('tenant_id').notNullable()
      table.string('label').notNullable()
      table.string('status').notNullable().defaultTo('usable')
      table.timestamp('created_at').notNullable()
      table.index(['tenant_id', 'id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

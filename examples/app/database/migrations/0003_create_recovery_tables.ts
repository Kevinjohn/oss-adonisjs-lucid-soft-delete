/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file distributed with this source code.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateRecoveryTables extends BaseSchema {
  async up() {
    this.schema.createTable('recovery_groups', (table) => {
      table.uuid('id').primary()
      table.integer('tenant_id').notNullable()
      table.string('label').notNullable()
      table.string('status').notNullable().defaultTo('usable')
      table.timestamp('created_at').notNullable()
      table.index(['tenant_id', 'id'])
    })

    this.schema.createTable('recovery_records', (table) => {
      table.integer('tenant_id').notNullable()
      table.integer('record_id').notNullable()
      table.uuid('group_id').notNullable().references('id').inTable('recovery_groups')
      table.timestamp('deleted_at').notNullable()
      table.primary(['tenant_id', 'record_id'])
      table.index(['tenant_id', 'group_id'])
    })
  }

  async down() {
    this.schema.dropTable('recovery_records')
    this.schema.dropTable('recovery_groups')
  }
}

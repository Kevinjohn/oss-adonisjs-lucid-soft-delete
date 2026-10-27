/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateLifecycleTables extends BaseSchema {
  async up() {
    this.schema.createTable('lifecycle_parents', (table) => {
      table.increments('id')
      table.integer('tenant_id').notNullable()
      table.string('label').notNullable()
      table.timestamp('archived_at').nullable()
      table.timestamp('deleted_at').nullable()
    })
    this.schema.createTable('lifecycle_children', (table) => {
      table.increments('id')
      table.integer('tenant_id').notNullable()
      table.integer('parent_id').notNullable()
      table.string('label').notNullable()
      table.timestamp('deleted_at').nullable()
    })
    this.schema.createTable('lifecycle_notes', (table) => {
      table.increments('id')
      table.integer('tenant_id').notNullable()
      table.integer('parent_id').notNullable()
      table.string('action').notNullable()
    })
  }

  async down() {
    this.schema.dropTable('lifecycle_notes')
    this.schema.dropTable('lifecycle_children')
    this.schema.dropTable('lifecycle_parents')
  }
}

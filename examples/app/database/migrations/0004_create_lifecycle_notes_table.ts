/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateLifecycleNotesTable extends BaseSchema {
  protected tableName = 'lifecycle_notes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('tenant_id').notNullable()
      table.integer('parent_id').notNullable()
      table.string('action').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

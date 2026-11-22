import type User from '#models/user'
import { BaseTransformer } from '@adonisjs/core/transformers'

/** The recycle-bin fields shown for one soft-deleted account. */
export default class DeletedUserTransformer extends BaseTransformer<User> {
  toObject() {
    return this.pick(this.resource, ['id', 'email', 'deletedAt'])
  }
}

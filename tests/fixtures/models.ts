/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import {
  BaseModel,
  belongsTo,
  column,
  hasMany,
  hasManyThrough,
  hasOne,
  manyToMany,
} from '@adonisjs/lucid/orm'
import type {
  BelongsTo,
  HasMany,
  HasManyThrough,
  HasOne,
  ManyToMany,
} from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from '../../src/mixin.js'

class SoftDeleteModel extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare id: number
}

export class RelationUser extends SoftDeleteModel {
  static table = 'users'

  @column()
  declare username: string

  @column()
  declare email: string

  @column()
  declare managerId: number | null

  @hasOne(() => RelationProfile, { foreignKey: 'userId' })
  declare profile: HasOne<typeof RelationProfile>

  @hasMany(() => RelationPost, { foreignKey: 'userId' })
  declare posts: HasMany<typeof RelationPost>

  @manyToMany(() => RelationIndustry, {
    pivotTable: 'industry_user',
    pivotForeignKey: 'user_id',
    pivotRelatedForeignKey: 'industry_id',
  })
  declare industries: ManyToMany<typeof RelationIndustry>

  @hasManyThrough([() => RelationComment, () => RelationPost], {
    foreignKey: 'userId',
    throughForeignKey: 'postId',
  })
  declare comments: HasManyThrough<typeof RelationComment>

  @hasMany(() => RelationUser, { foreignKey: 'managerId' })
  declare reports: HasMany<typeof RelationUser>

  @belongsTo(() => RelationUser, { foreignKey: 'managerId' })
  declare manager: BelongsTo<typeof RelationUser>
}

export class RelationProfile extends SoftDeleteModel {
  static table = 'profiles'

  @column()
  declare userId: number

  @column()
  declare displayName: string
}

export class RelationPost extends SoftDeleteModel {
  static table = 'posts'

  @column()
  declare userId: number

  @column()
  declare title: string

  @belongsTo(() => RelationUser, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof RelationUser>

  @hasMany(() => RelationComment, { foreignKey: 'postId' })
  declare comments: HasMany<typeof RelationComment>
}

export class RelationComment extends SoftDeleteModel {
  static table = 'comments'

  @column()
  declare postId: number

  @column()
  declare body: string

  @belongsTo(() => RelationPost, { foreignKey: 'postId' })
  declare post: BelongsTo<typeof RelationPost>
}

export class RelationIndustry extends SoftDeleteModel {
  static table = 'industries'

  @column()
  declare title: string
}

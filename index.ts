/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2024 Lookin Anton <alsd@lookinlab.ru>
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import './src/types/querybuilder.js'

export { configure } from './configure.js'
export { SoftDeletes } from './src/mixin.js'
export type {
  SoftDeletesInstance,
  SoftDeletesStatics,
  SoftDeletesConstructor,
} from './src/mixin.js'
export { hasSoftDeletes, SOFT_DELETES } from './src/guard.js'
export type { SoftDeletesModel } from './src/guard.js'
export { E_MODEL_SOFT_DELETE, E_MODEL_FORCE_DELETED, E_MODEL_NOT_PERSISTED } from './src/errors.js'

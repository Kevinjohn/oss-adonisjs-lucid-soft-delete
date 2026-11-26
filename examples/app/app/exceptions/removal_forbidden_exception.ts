/*
 * @kevinjohn/adonisjs-lucid-soft-delete
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file distributed with this source code.
 */

// #region REMOVAL_FORBIDDEN_EXCEPTION
import { Exception } from '@adonisjs/core/exceptions'

/** A permission refusal; the AdonisJS exception handler renders it as 403 Forbidden. */
export default class RemovalForbiddenException extends Exception {
  static status = 403
  static code = 'E_REMOVAL_FORBIDDEN'
  static message = 'Removal is not permitted'
}
// #endregion REMOVAL_FORBIDDEN_EXCEPTION

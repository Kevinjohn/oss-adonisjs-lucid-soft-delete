/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router.on('/').render('pages/home').as('home')

router
  .group(() => {
    router.get('signup', [controllers.NewAccount, 'create'])
    router.post('signup', [controllers.NewAccount, 'store'])

    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])
  })
  .use(middleware.guest())

router
  .group(() => {
    router.on('/dashboard').render('pages/dashboard').as('dashboard')
    router.post('logout', [controllers.Session, 'destroy'])
  })
  .use(middleware.auth())

router
  .group(() => {
    router.get('account/delete', [controllers.AccountDeletion, 'show']).as('account_deletion.show')
    router
      .post('account/delete', [controllers.AccountDeletion, 'destroy'])
      .as('account_deletion.destroy')
    router.get('admin/deleted-users', [controllers.DeletedUsers, 'index']).as('deleted_users.index')
    router
      .post('admin/deleted-users/:id/restore', [controllers.DeletedUsers, 'restore'])
      .as('deleted_users.restore')
  })
  .use(middleware.auth())

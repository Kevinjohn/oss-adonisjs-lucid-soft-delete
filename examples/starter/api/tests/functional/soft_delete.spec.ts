import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'

const password = 'SoftDeletePass123!'

test.group('soft delete', (group) => {
  group.each.setup(async () => {
    softDeleteAdminEmails.add('admin@example.test')
    const rollback = await testUtils.db().withGlobalTransaction()
    return async () => {
      softDeleteAdminEmails.clear()
      await rollback()
    }
  })

  test('an account deletes itself and an administrator restores it', async ({ client, assert }) => {
    const admin = await User.create({ email: 'admin@example.test', password })
    const member = await User.create({ email: 'member@example.test', password })

    const deleted = await client.delete('/api/v1/account').loginAs(member)
    deleted.assertStatus(204)
    assert.isNull(await User.find(member.id))
    const stored = await User.withTrashed().where('id', member.id).firstOrFail()
    assert.isTrue(stored.trashed)

    const refusedLogin = await client
      .post('/api/v1/auth/login')
      .json({ email: member.email, password })
    refusedLogin.assertStatus(400)

    const listed = await client.get('/api/v1/admin/deleted-users').loginAs(admin)
    listed.assertStatus(200)
    assert.deepEqual(
      listed.body().map((user: { email: string }) => user.email),
      ['member@example.test']
    )

    const restored = await client
      .post(`/api/v1/admin/deleted-users/${member.id}/restore`)
      .loginAs(admin)
    restored.assertStatus(200)
    assert.isNotNull(await User.find(member.id))
    const login = await client.post('/api/v1/auth/login').json({ email: member.email, password })
    login.assertStatus(200)
  })

  test('a non-administrator and a guest cannot list or restore', async ({ client }) => {
    const member = await User.create({ email: 'member@example.test', password })
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const listed = await client.get('/api/v1/admin/deleted-users').loginAs(member)
    listed.assertStatus(403)
    const restored = await client
      .post(`/api/v1/admin/deleted-users/${deleted.id}/restore`)
      .loginAs(member)
    restored.assertStatus(403)

    const guestList = await client.get('/api/v1/admin/deleted-users')
    guestList.assertStatus(401)
    const guestRestore = await client.post(`/api/v1/admin/deleted-users/${deleted.id}/restore`)
    guestRestore.assertStatus(401)
    const guestDelete = await client.delete('/api/v1/account')
    guestDelete.assertStatus(401)
  })

  test('an address differing only in case is not an administrator', async ({ client }) => {
    const lookalike = await User.create({ email: 'Admin@example.test', password })
    const listed = await client.get('/api/v1/admin/deleted-users').loginAs(lookalike)
    listed.assertStatus(403)
  })
})

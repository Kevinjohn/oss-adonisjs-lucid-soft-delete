import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'
import { InertiaSession } from '../helpers/inertia_session.js'

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

  test('an account deletes itself and an administrator restores it', async ({ assert }) => {
    await User.create({ email: 'admin@example.test', password })
    const member = await User.create({ email: 'member@example.test', password })

    const session = new InertiaSession()
    await session.login(member.email, password)
    await session.props('/account/delete')
    const deleted = await session.request('/account/delete', {})
    assert.equal(deleted.headers.get('location'), '/login')
    assert.isNull(await User.find(member.id))
    const signedOut = await session.request('/dashboard')
    assert.equal(signedOut.headers.get('location'), '/login')
    await assert.rejects(() => new InertiaSession().login(member.email, password))

    const admin = new InertiaSession()
    await admin.login('admin@example.test', password)
    const listed = await admin.props<{ users: { email: string }[] }>('/admin/deleted-users')
    assert.deepEqual(
      listed.users.map((user) => user.email),
      ['member@example.test']
    )
    const restored = await admin.request(`/admin/deleted-users/${member.id}/restore`, {})
    assert.equal(restored.headers.get('location'), '/admin/deleted-users')
    assert.isNotNull(await User.find(member.id))
    await new InertiaSession().login(member.email, password)
  })

  test('a non-administrator and a guest cannot list or restore', async ({ assert }) => {
    await User.create({ email: 'member@example.test', password })
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const member = new InertiaSession()
    await member.login('member@example.test', password)
    const listed = await member.request('/admin/deleted-users')
    assert.equal(listed.status, 403)
    const refused = await member.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(refused.status, 403)
    assert.isNull(await User.find(deleted.id))

    const guest = new InertiaSession()
    await guest.props('/login')
    const guestList = await guest.request('/admin/deleted-users')
    assert.equal(guestList.headers.get('location'), '/login')
    const guestRestore = await guest.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(guestRestore.headers.get('location'), '/login')
    assert.isNull(await User.find(deleted.id))
  })

  test('an address differing only in case is not an administrator', async ({ assert }) => {
    await User.create({ email: 'Admin@example.test', password })
    const lookalike = new InertiaSession()
    await lookalike.login('Admin@example.test', password)
    const listed = await lookalike.request('/admin/deleted-users')
    assert.equal(listed.status, 403)
  })
})

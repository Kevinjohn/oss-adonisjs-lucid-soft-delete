import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import { FormSession } from '#tests/helpers/form_session'

const password = 'SoftDeletePass123!'

test.group('soft delete', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    return async () => {
      await rollback()
    }
  })

  test('an account deletes itself and an administrator restores it', async ({ assert }) => {
    const adminAccount = await User.create({ email: 'admin@example.test', password })
    adminAccount.isSoftDeleteAdmin = true
    await adminAccount.save()
    const member = await User.create({ email: 'member@example.test', password })

    const session = new FormSession()
    await session.login(member.email, password)
    await session.request('/account/delete')
    const deleted = await session.request('/account/delete', {})
    assert.equal(deleted.headers.get('location'), '/login')
    assert.isNull(await User.find(member.id))
    const signedOut = await session.request('/dashboard')
    assert.equal(signedOut.headers.get('location'), '/login')
    await assert.rejects(() => new FormSession().login(member.email, password))

    const admin = new FormSession()
    await admin.login('admin@example.test', password)
    await admin.request('/admin/deleted-users')
    assert.include(admin.html, 'member@example.test')
    const restored = await admin.request(`/admin/deleted-users/${member.id}/restore`, {})
    assert.equal(restored.headers.get('location'), '/admin/deleted-users')
    assert.isNotNull(await User.find(member.id))
    await new FormSession().login(member.email, password)
  })

  test('a non-administrator and a guest cannot list or restore', async ({ assert }) => {
    await User.create({ email: 'member@example.test', password })
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const member = new FormSession()
    await member.login('member@example.test', password)
    const listed = await member.request('/admin/deleted-users')
    assert.equal(listed.status, 403)
    await member.request('/dashboard')
    const refused = await member.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(refused.status, 403)
    assert.isNull(await User.find(deleted.id))

    const guest = new FormSession()
    const guestList = await guest.request('/admin/deleted-users')
    assert.equal(guestList.headers.get('location'), '/login')
    await guest.request('/login')
    const guestRestore = await guest.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(guestRestore.headers.get('location'), '/login')
    assert.isNull(await User.find(deleted.id))
  })

  test('public signup cannot grant deleted-account access', async ({ assert }) => {
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const signup = new FormSession()
    await signup.request('/signup')
    const created = await signup.request('/signup', {
      fullName: 'New account',
      email: 'admin@example.test',
      password,
      passwordConfirmation: password,
      isSoftDeleteAdmin: 'true',
    })
    assert.equal(created.headers.get('location'), '/dashboard')
    const signedUp = await User.findByOrFail('email', 'admin@example.test')
    assert.include([false, 0], signedUp.isSoftDeleteAdmin)
    const listed = await signup.request('/admin/deleted-users')
    assert.equal(listed.status, 403)
    await signup.request('/dashboard')
    const restored = await signup.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(restored.status, 403)
    assert.isNull(await User.find(deleted.id))
  })

  test('revoking an administrator denies later list and restore requests', async ({ assert }) => {
    const adminAccount = await User.create({ email: 'admin@example.test', password })
    adminAccount.isSoftDeleteAdmin = true
    await adminAccount.save()
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const admin = new FormSession()
    await admin.login(adminAccount.email, password)
    const before = await admin.request('/admin/deleted-users')
    assert.equal(before.status, 200)
    adminAccount.isSoftDeleteAdmin = false
    await adminAccount.save()

    const listed = await admin.request('/admin/deleted-users')
    assert.equal(listed.status, 403)
    await admin.request('/dashboard')
    const restored = await admin.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(restored.status, 403)
    assert.isNull(await User.find(deleted.id))
  })
})

import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import { InertiaSession } from '../helpers/inertia_session.js'

const password = 'SoftDeletePass123!'

test.group('soft delete', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('an account deletes itself and an administrator restores it', async ({ assert }) => {
    const adminAccount = await User.create({ email: 'admin@example.test', password })
    adminAccount.isSoftDeleteAdmin = true
    await adminAccount.save()
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

  test('recycle bin projects a stable bounded page and handles empty pages', async ({ assert }) => {
    const adminAccount = await User.create({
      email: 'admin@example.test',
      password,
      isSoftDeleteAdmin: true,
    })
    // The two lowest IDs are deleted last, so deletion-time order and ID order disagree.
    await db.table('users').multiInsert(
      Array.from({ length: 27 }, (_, index) => ({
        email: `deleted-${index}@example.test`,
        password: adminAccount.password,
        created_at: '2026-01-01 00:00:00',
        deleted_at: index < 2 ? '2026-01-02 00:00:00' : '2026-01-01 00:00:00',
      }))
    )
    const expected = [1, 0, ...Array.from({ length: 25 }, (_, index) => 26 - index)].map(
      (index) => `deleted-${index}@example.test`
    )
    const executed: string[] = []
    const recordQuery = (query: { sql: string }) => executed.push(query.sql)
    db.connection().getWriteClient().on('query', recordQuery)
    const admin = new InertiaSession()
    await admin.login(adminAccount.email, password)
    type Page = {
      currentPage: number
      lastPage: number
      users: { id: number; email: string; deletedAt: string }[]
    }
    const first = await admin.props<Page>('/admin/deleted-users')
    db.connection().getWriteClient().off('query', recordQuery)
    assert.isTrue(
      executed.some((sql) =>
        /^select [`"]id[`"], [`"]email[`"], [`"]deleted_at[`"] from/.test(sql)
      ),
      `The recycle bin selects only the display fields:\n${executed.join('\n')}`
    )
    assert.equal(first.currentPage, 1)
    assert.equal(first.lastPage, 2)
    assert.deepEqual(
      first.users.map((user) => user.email),
      expected.slice(0, 25)
    )
    assert.deepEqual(Object.keys(first.users[0]).sort(), ['deletedAt', 'email', 'id'])
    const second = await admin.props<Page>('/admin/deleted-users?page=2')
    assert.equal(second.currentPage, 2)
    assert.deepEqual(
      second.users.map((user) => user.email),
      expected.slice(25)
    )
    const empty = await admin.props<Page>('/admin/deleted-users?page=3')
    assert.deepEqual(empty.users, [])
    const invalid = await admin.request('/admin/deleted-users?page=0')
    assert.include([302, 303], invalid.status)
  })

  test('restore validates the identifier and leaves rows unchanged on failure', async ({
    assert,
  }) => {
    const adminAccount = await User.create({
      email: 'admin@example.test',
      password,
      isSoftDeleteAdmin: true,
    })
    const member = await User.create({ email: 'member@example.test', password })
    await member.delete()
    const before = await User.onlyTrashed().where('id', member.id).firstOrFail()
    const admin = new InertiaSession()
    await admin.login(adminAccount.email, password)
    await admin.props('/admin/deleted-users')

    for (const id of [
      'not-an-id',
      '0',
      '-1',
      '1.5',
      '1e0',
      '1.00000000000000001',
      '9007199254740992',
    ]) {
      const result = await admin.request(`/admin/deleted-users/${id}/restore`, {})
      assert.include([302, 303], result.status)
    }
    const missing = await admin.request('/admin/deleted-users/9007199254740991/restore', {})
    assert.equal(missing.status, 404)
    const active = await admin.request(`/admin/deleted-users/${adminAccount.id}/restore`, {})
    assert.equal(active.status, 404)
    const after = await User.onlyTrashed().where('id', member.id).firstOrFail()
    assert.equal(after.deletedAt?.toISO(), before.deletedAt?.toISO())
    assert.isNotNull(await User.find(adminAccount.id))
  })

  test('public signup cannot grant deleted-account access', async ({ assert }) => {
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const signup = new InertiaSession()
    await signup.props('/signup')
    const created = await signup.request('/signup', {
      fullName: 'New account',
      email: 'admin@example.test',
      password,
      passwordConfirmation: password,
      isSoftDeleteAdmin: true,
    })
    assert.equal(created.headers.get('location'), '/dashboard')
    const signedUp = await User.findByOrFail('email', 'admin@example.test')
    assert.include([false, 0], signedUp.isSoftDeleteAdmin)
    const listed = await signup.request('/admin/deleted-users')
    assert.equal(listed.status, 403)
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

    const admin = new InertiaSession()
    await admin.login(adminAccount.email, password)
    const before = await admin.request('/admin/deleted-users')
    assert.equal(before.status, 200)
    adminAccount.isSoftDeleteAdmin = false
    await adminAccount.save()

    const listed = await admin.request('/admin/deleted-users')
    assert.equal(listed.status, 403)
    const restored = await admin.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(restored.status, 403)
    assert.isNull(await User.find(deleted.id))
  })
})

import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'

const password = 'SoftDeletePass123!'

test.group('soft delete', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('an account deletes itself and an administrator restores it', async ({ client, assert }) => {
    const admin = await User.create({ email: 'admin@example.test', password })
    admin.isSoftDeleteAdmin = true
    await admin.save()
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

  test('the same bearer token resumes authenticating after restoration', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({ email: 'admin@example.test', password })
    admin.isSoftDeleteAdmin = true
    await admin.save()
    const member = await User.create({ email: 'member@example.test', password })

    const login = await client.post('/api/v1/auth/login').json({ email: member.email, password })
    login.assertStatus(200)
    const token = login.body().data.token as string
    assert.isString(token)
    assert.isNotEmpty(token)

    const profileBefore = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
    profileBefore.assertStatus(200)
    assert.equal(profileBefore.body().data.email, member.email)

    const deleted = await client
      .delete('/api/v1/account')
      .header('Authorization', `Bearer ${token}`)
    deleted.assertStatus(204)
    const profileWhileDeleted = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
    profileWhileDeleted.assertStatus(401)

    const restored = await client
      .post(`/api/v1/admin/deleted-users/${member.id}/restore`)
      .loginAs(admin)
    restored.assertStatus(200)
    const profileAfter = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
    profileAfter.assertStatus(200)
    assert.equal(profileAfter.body().data.email, member.email)
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

  test('recycle bin projects a stable bounded page and handles empty pages', async ({
    client,
    assert,
  }) => {
    const adminAccount = await User.create({
      email: 'admin@example.test',
      password,
      isSoftDeleteAdmin: true,
    })
    const deletedAt = '2026-01-01 00:00:00'
    await db.table('users').multiInsert(
      Array.from({ length: 27 }, (_, index) => ({
        email: `deleted-${index}@example.test`,
        password: adminAccount.password,
        created_at: deletedAt,
        deleted_at: deletedAt,
      }))
    )
    const expected = Array.from({ length: 27 }, (_, index) => `deleted-${26 - index}@example.test`)
    const first = await client.get('/api/v1/admin/deleted-users').loginAs(adminAccount)
    first.assertStatus(200)
    assert.deepEqual(
      first.body().map((user: { email: string }) => user.email),
      expected.slice(0, 25)
    )
    assert.deepEqual(Object.keys(first.body()[0]).sort(), ['deletedAt', 'email', 'id'])
    first.assertHeader('x-total-count', '27')
    first.assertHeader('x-last-page', '2')
    const second = await client.get('/api/v1/admin/deleted-users?page=2').loginAs(adminAccount)
    second.assertStatus(200)
    second.assertHeader('x-current-page', '2')
    assert.deepEqual(
      second.body().map((user: { email: string }) => user.email),
      expected.slice(25)
    )
    const empty = await client.get('/api/v1/admin/deleted-users?page=3').loginAs(adminAccount)
    empty.assertStatus(200)
    assert.deepEqual(empty.body(), [])
    const invalid = await client.get('/api/v1/admin/deleted-users?page=0').loginAs(adminAccount)
    invalid.assertStatus(422)
  })

  test('restore validates the identifier and leaves rows unchanged on failure', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({
      email: 'admin@example.test',
      password,
      isSoftDeleteAdmin: true,
    })
    const member = await User.create({ email: 'member@example.test', password })
    await member.delete()
    const before = await User.onlyTrashed().where('id', member.id).firstOrFail()

    for (const id of [
      'not-an-id',
      '0',
      '-1',
      '1.5',
      '1e0',
      '1.00000000000000001',
      '9007199254740992',
    ]) {
      const result = await client.post(`/api/v1/admin/deleted-users/${id}/restore`).loginAs(admin)
      result.assertStatus(422)
    }
    const missing = await client
      .post('/api/v1/admin/deleted-users/9007199254740991/restore')
      .loginAs(admin)
    missing.assertStatus(404)
    const active = await client
      .post(`/api/v1/admin/deleted-users/${admin.id}/restore`)
      .loginAs(admin)
    active.assertStatus(404)
    const after = await User.onlyTrashed().where('id', member.id).firstOrFail()
    assert.equal(after.deletedAt?.toISO(), before.deletedAt?.toISO())
    assert.isNotNull(await User.find(admin.id))
  })

  test('public signup cannot grant deleted-account access', async ({ client, assert }) => {
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const signup = await client.post('/api/v1/auth/signup').json({
      fullName: 'New account',
      email: 'admin@example.test',
      password,
      passwordConfirmation: password,
      isSoftDeleteAdmin: true,
    } as never)
    signup.assertStatus(200)
    const signedUp = await User.findByOrFail('email', 'admin@example.test')
    assert.include([false, 0], signedUp.isSoftDeleteAdmin)

    const listed = await client.get('/api/v1/admin/deleted-users').loginAs(signedUp)
    listed.assertStatus(403)
    const restored = await client
      .post(`/api/v1/admin/deleted-users/${deleted.id}/restore`)
      .loginAs(signedUp)
    restored.assertStatus(403)
    assert.isNull(await User.find(deleted.id))
  })

  test('revoking an administrator denies later list and restore requests', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({ email: 'admin@example.test', password })
    admin.isSoftDeleteAdmin = true
    await admin.save()
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const before = await client.get('/api/v1/admin/deleted-users').loginAs(admin)
    before.assertStatus(200)
    admin.isSoftDeleteAdmin = false
    await admin.save()

    const listed = await client.get('/api/v1/admin/deleted-users').loginAs(admin)
    listed.assertStatus(403)
    const restored = await client
      .post(`/api/v1/admin/deleted-users/${deleted.id}/restore`)
      .loginAs(admin)
    restored.assertStatus(403)
    assert.isNull(await User.find(deleted.id))
  })
})

import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'

const password = 'SoftDeletePass123!'

test.group('soft delete in the browser', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('an administrator restores a deleted account', async ({ visit, assert }) => {
    const adminAccount = await User.create({ email: 'admin@example.test', password })
    adminAccount.isSoftDeleteAdmin = true
    await adminAccount.save()
    const member = await User.create({ email: 'member@example.test', password })
    await member.delete()

    const page = await visit('/login')
    await page.getByLabel('Email').fill('admin@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')

    await page.getByRole('link', { name: 'Deleted accounts' }).click()
    await page.waitForURL('**/admin/deleted-users')
    await page.getByRole('button', { name: 'Restore member@example.test' }).click()
    await page.getByText('member@example.test is restored.').waitFor()
    assert.isNotNull(await User.find(member.id))
  })

  test('an administrator follows the recycle-bin page links', async ({ visit }) => {
    const adminAccount = await User.create({
      email: 'admin@example.test',
      password,
      isSoftDeleteAdmin: true,
    })
    await db.table('users').multiInsert(
      Array.from({ length: 26 }, (_, index) => ({
        email: `deleted-${index}@example.test`,
        password: adminAccount.password,
        created_at: '2026-01-01 00:00:00',
        deleted_at: '2026-01-01 00:00:00',
      }))
    )

    const page = await visit('/login')
    await page.getByLabel('Email').fill('admin@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')
    await page.getByRole('link', { name: 'Deleted accounts' }).click()
    await page.waitForURL('**/admin/deleted-users')

    await page.getByRole('link', { name: 'Next page' }).click()
    await page.waitForURL('**/admin/deleted-users?page=2')
    await page
      .getByRole('button', { name: 'Restore deleted-0@example.test', exact: true })
      .waitFor()
    await page.getByRole('link', { name: 'Previous page' }).click()
    await page.waitForURL('**/admin/deleted-users?page=1')
    await page
      .getByRole('button', { name: 'Restore deleted-25@example.test', exact: true })
      .waitFor()
  })
  test('a signed-in member reaches account deletion from the dashboard', async ({
    visit,
    assert,
  }) => {
    await User.create({ email: 'member@example.test', password })

    const page = await visit('/login')
    await page.getByLabel('Email').fill('member@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')

    assert.equal(await page.getByRole('link', { name: 'Deleted accounts' }).count(), 0)
    await page.getByRole('link', { name: 'Delete account' }).click()
    await page.waitForURL('**/account/delete')
    await page.getByRole('heading', { name: 'Delete your account' }).waitFor()
  })
})

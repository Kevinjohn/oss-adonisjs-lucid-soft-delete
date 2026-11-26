import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'

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
    await page.getByText('member@example.test is restored.', { exact: true }).waitFor()
    assert.isNotNull(await User.find(member.id))
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

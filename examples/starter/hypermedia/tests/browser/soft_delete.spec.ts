import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'

const password = 'SoftDeletePass123!'

test.group('soft delete in the browser', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    return async () => {
      await rollback()
    }
  })

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

    await page.goto('/admin/deleted-users')
    await page.getByRole('button', { name: 'Restore member@example.test' }).click()
    await page.getByText('member@example.test is restored.').waitFor()
    assert.isNotNull(await User.find(member.id))
  })
})

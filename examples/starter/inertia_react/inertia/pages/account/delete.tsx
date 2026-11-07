import { Form } from '@adonisjs/inertia/react'
import Page from '~/components/page'
import AppLayout from '~/layouts/app'

export default function DeleteAccount() {
  return (
    <Page title="Delete your account">
      <p>Your account is hidden at once and you are signed out. An administrator can restore it.</p>
      <Form route="account_deletion.destroy">
        {({ processing }) => (
          <button type="submit" className="btn btn--primary" disabled={processing}>
            Delete my account
          </button>
        )}
      </Form>
    </Page>
  )
}

DeleteAccount.layout = [AppLayout]

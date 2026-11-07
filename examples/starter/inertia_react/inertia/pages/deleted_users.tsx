import { Form } from '@adonisjs/inertia/react'
import Page from '~/components/page'
import AppLayout from '~/layouts/app'

export default function DeletedUsers({
  users,
}: {
  users: { id: number; email: string; deletedAt: string }[]
}) {
  return (
    <Page title="Deleted accounts">
      {users.length === 0 ? (
        <p>No account is deleted.</p>
      ) : (
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              {user.email}, deleted {user.deletedAt}
              <Form route="deleted_users.restore" routeParams={{ id: user.id }}>
                {({ processing }) => (
                  <button type="submit" className="btn btn--primary" disabled={processing}>
                    Restore {user.email}
                  </button>
                )}
              </Form>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

DeletedUsers.layout = [AppLayout]

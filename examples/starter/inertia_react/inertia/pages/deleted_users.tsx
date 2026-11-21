import { Form, Link } from '@adonisjs/inertia/react'
import Page from '~/components/page'
import AppLayout from '~/layouts/app'

export default function DeletedUsers({
  users,
  currentPage,
  lastPage,
}: {
  users: { id: number; email: string; deletedAt: string }[]
  currentPage: number
  lastPage: number
}) {
  return (
    <Page title="Deleted accounts">
      {users.length === 0 ? (
        <p>{currentPage === 1 ? 'No account is deleted.' : 'No deleted accounts on this page.'}</p>
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
      {(currentPage > 1 || currentPage < lastPage) && (
        <nav aria-label="Deleted accounts pages">
          {currentPage > 1 && (
            <>
              <Link href="?page=1">First page</Link>{' '}
              <Link href={`?page=${currentPage - 1}`}>Previous page</Link>{' '}
            </>
          )}
          {currentPage < lastPage && <Link href={`?page=${currentPage + 1}`}>Next page</Link>}
        </nav>
      )}
    </Page>
  )
}

DeletedUsers.layout = [AppLayout]

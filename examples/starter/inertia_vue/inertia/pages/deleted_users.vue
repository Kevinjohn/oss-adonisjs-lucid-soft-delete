<script setup lang="ts">
import { Form, Link } from '@adonisjs/inertia/vue'
import Page from '~/components/page.vue'
import AppLayout from '~/layouts/app.vue'

defineProps<{
  users: { id: number; email: string; deletedAt: string }[]
  currentPage: number
  lastPage: number
}>()
</script>

<template>
  <AppLayout>
    <Page title="Deleted accounts">
      <p v-if="users.length === 0">
        {{ currentPage === 1 ? 'No account is deleted.' : 'No deleted accounts on this page.' }}
      </p>
      <ul v-else>
        <li v-for="user in users" :key="user.id">
          {{ user.email }}, deleted {{ user.deletedAt }}
          <Form v-slot="{ processing }" route="deleted_users.restore" :params="{ id: user.id }">
            <button type="submit" class="btn btn--primary" :disabled="processing">
              Restore {{ user.email }}
            </button>
          </Form>
        </li>
      </ul>
      <nav v-if="currentPage > 1 || currentPage < lastPage" aria-label="Deleted accounts pages">
        <Link v-if="currentPage > 1" href="?page=1">First page</Link>
        <Link v-if="currentPage > 1" :href="`?page=${currentPage - 1}`">Previous page</Link>
        <Link v-if="currentPage < lastPage" :href="`?page=${currentPage + 1}`">Next page</Link>
      </nav>
    </Page>
  </AppLayout>
</template>

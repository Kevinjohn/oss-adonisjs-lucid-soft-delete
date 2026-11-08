<script setup lang="ts">
import { Form } from '@adonisjs/inertia/vue'
import Page from '~/components/page.vue'
import AppLayout from '~/layouts/app.vue'

defineProps<{ users: { id: number; email: string; deletedAt: string }[] }>()
</script>

<template>
  <AppLayout>
    <Page title="Deleted accounts">
      <p v-if="users.length === 0">No account is deleted.</p>
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
    </Page>
  </AppLayout>
</template>

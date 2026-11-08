<script setup lang="ts">
import { Form } from '@adonisjs/inertia/vue'
import Page from '~/components/page.vue'
import AppLayout from '~/layouts/app.vue'
</script>

<template>
  <AppLayout>
    <Page title="Delete your account">
      <p>Your account is hidden at once and you are signed out. An administrator can restore it.</p>
      <Form v-slot="{ processing }" route="account_deletion.destroy">
        <button type="submit" class="btn btn--primary" :disabled="processing">
          Delete my account
        </button>
      </Form>
    </Page>
  </AppLayout>
</template>

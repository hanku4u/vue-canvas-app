<script setup lang="ts">
// Placeholder until the admin screens (roadmap F12). The route is already admin-guarded.
import { NCard, NEmpty } from 'naive-ui'
import DefaultLayout from '@/app/layout/DefaultLayout.vue'

const sections = [
  'Admins',
  'Canvases (all, transfer ownership, restore)',
  'User access lookup',
  'Usage overview, datasets, slow queries and errors',
  'Health',
  'Audit log',
]
</script>

<template>
  <DefaultLayout>
    <div class="admin">
      <h1 class="admin__title">Admin</h1>
      <NCard>
        <NEmpty
          description="The admin screens arrive in roadmap milestone F12."
          data-testid="admin-placeholder"
        >
          <template #extra>
            <ul class="admin__list">
              <li v-for="section in sections" :key="section">{{ section }}</li>
            </ul>
          </template>
        </NEmpty>
      </NCard>
    </div>
  </DefaultLayout>
</template>

<style scoped>
.admin {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
}

.admin__title {
  margin: 0 0 16px;
  font-size: 22px;
}

.admin__list {
  margin: 8px 0 0;
  padding-left: 18px;
  text-align: left;
  color: var(--app-text-muted);
}
</style>

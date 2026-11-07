<script setup lang="ts">
// F0 placeholder: proves routing, Naive UI, Vue Query and the /api mock work end to end.
// Replaced by the real Home page (canvas list) in F1.
import { useQuery } from '@tanstack/vue-query'
import { NAlert, NCard, NSpin, NTag } from 'naive-ui'
import { api, ApiError } from '@/api/client'
import type { Me } from '@/api/types'

const mockApi = import.meta.env.VITE_API_MOCK === '1'

const me = useQuery({
  queryKey: ['me'],
  queryFn: ({ signal }) => api.get<Me>('/me', { signal }),
})

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`
  return String(error)
}
</script>

<template>
  <main class="home">
    <NCard class="home__card" title="vue-canvas-app">
      <p class="home__subtitle">Infinite-canvas workspace for fab engineers</p>
      <div class="home__row">
        <NTag :type="mockApi ? 'info' : 'success'" size="small">
          {{ mockApi ? 'API: in-browser mock' : 'API: FastAPI backend' }}
        </NTag>
      </div>
      <NSpin v-if="me.isPending.value" size="small" />
      <NAlert v-else-if="me.isError.value" type="error" :show-icon="false">
        {{ errorText(me.error.value) }}
      </NAlert>
      <p v-else-if="me.data.value" data-testid="signed-in">
        Signed in as <strong>{{ me.data.value.knoxId }}</strong> ({{ me.data.value.displayName }})
        <NTag v-if="me.data.value.isAdmin" type="warning" size="small">admin</NTag>
      </p>
    </NCard>
  </main>
</template>

<style scoped>
.home {
  display: grid;
  place-items: center;
  min-height: 100%;
  padding: 16px;
}

.home__card {
  width: min(480px, 100%);
}

.home__subtitle {
  margin: 0 0 12px;
  color: var(--app-text-muted);
}

.home__row {
  margin-bottom: 12px;
}
</style>

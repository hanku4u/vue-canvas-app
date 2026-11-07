<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { NButton, NResult } from 'naive-ui'
import DefaultLayout from '@/app/layout/DefaultLayout.vue'

const props = withDefaults(
  defineProps<{ status: 403 | 404; title?: string; description?: string; bare?: boolean }>(),
  { title: undefined, description: undefined, bare: false },
)

const resultStatus = computed(() => (props.status === 403 ? '403' : '404'))

const text = computed(() => {
  if (props.status === 403) {
    return {
      title: props.title ?? 'No access',
      description: props.description ?? "You don't have permission to view this page.",
    }
  }
  return {
    title: props.title ?? 'Not found',
    description: props.description ?? "This page doesn't exist, or you don't have access to it.",
  }
})
</script>

<template>
  <component :is="bare ? 'div' : DefaultLayout" class="status-page__host">
    <div class="status-page" :data-testid="`status-${status}`">
      <NResult :status="resultStatus" :title="text.title" :description="text.description">
        <template #footer>
          <RouterLink v-slot="{ navigate }" to="/" custom>
            <NButton type="primary" @click="navigate">Back to canvases</NButton>
          </RouterLink>
        </template>
      </NResult>
    </div>
  </component>
</template>

<style scoped>
.status-page__host {
  height: 100%;
}

.status-page {
  display: grid;
  place-items: center;
  min-height: 100%;
  padding: 32px 16px;
}
</style>

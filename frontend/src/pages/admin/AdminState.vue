<script setup lang="ts">
import { NButton, NEmpty, NResult, NSkeleton } from 'naive-ui'
import { describeError } from '@/ui/useApiErrorNotifier'

/** Loading, error and empty states for an admin query; the slot renders the data. */
defineProps<{
  pending: boolean
  error: unknown
  empty?: boolean
  emptyText?: string
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="pending" class="admin-state" data-testid="admin-loading">
    <NSkeleton text :repeat="4" />
  </div>
  <NResult
    v-else-if="error"
    status="error"
    title="Could not load this page"
    :description="describeError(error)"
    size="small"
    data-testid="admin-error"
  >
    <template #footer>
      <NButton size="small" @click="$emit('retry')">Retry</NButton>
    </template>
  </NResult>
  <NEmpty
    v-else-if="empty"
    :description="emptyText ?? 'Nothing here yet.'"
    class="admin-state"
    data-testid="admin-empty"
  />
  <slot v-else />
</template>

<style scoped>
.admin-state {
  padding: 24px 0;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NIcon, NSkeleton, NSpin } from 'naive-ui'
import { Database, TriangleExclamationPoint } from '@lucide/vue'
import { ApiError } from '@/api/client'
import type { DatasetParam } from '@/api/types'
import type { DataState } from '@/stores/componentData'

/**
 * The shared states of a data component (docs/canvas-ux.md, "Empty, loading and error
 * states"). Renders the default slot when there is data; while refetching the previous
 * data stays visible, dimmed.
 */
const props = defineProps<{
  state: DataState
  error?: unknown
  missing?: DatasetParam[]
  params?: Record<string, unknown>
}>()
const emit = defineEmits<{ retry: [] }>()

const errorInfo = computed(() => {
  const error = props.error
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message, requestId: error.requestId }
  }
  return { code: 'ERROR', message: error instanceof Error ? error.message : String(error ?? '') }
})

const paramSummary = computed(() =>
  Object.entries(props.params ?? {})
    .map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · '),
)
</script>

<template>
  <div class="data-state" :data-state="state" data-testid="data-state">
    <div v-if="state === 'unconfigured'" class="data-state__message">
      <NIcon :size="22"><Database /></NIcon>
      <span>Choose a dataset in the inspector.</span>
    </div>
    <div v-else-if="state === 'missing'" class="data-state__message">
      <NIcon :size="22"><Database /></NIcon>
      <span>
        Set
        <strong>{{ (missing ?? []).map((p) => p.label ?? p.name).join(', ') }}</strong>
        in the inspector to load data.
      </span>
    </div>
    <div v-else-if="state === 'loading'" class="data-state__loading">
      <NSkeleton text :repeat="5" />
    </div>
    <div
      v-else-if="state === 'error'"
      class="data-state__message is-error"
      data-testid="data-error"
    >
      <NIcon :size="22"><TriangleExclamationPoint /></NIcon>
      <span>{{ errorInfo.message }}</span>
      <code class="data-state__code">
        {{ errorInfo.code
        }}<template v-if="errorInfo.requestId"> · request {{ errorInfo.requestId }}</template>
      </code>
      <NButton size="tiny" class="nodrag" data-testid="data-retry" @click.stop="emit('retry')">
        Retry
      </NButton>
    </div>
    <div v-else-if="state === 'empty'" class="data-state__message" data-testid="data-empty">
      <NIcon :size="22"><Database /></NIcon>
      <span>No data for the current parameters.</span>
      <small v-if="paramSummary" class="data-state__params">{{ paramSummary }}</small>
    </div>
    <div v-else class="data-state__content" :class="{ 'is-refetching': state === 'refetching' }">
      <slot />
      <NSpin v-if="state === 'refetching'" class="data-state__spinner" :size="18" />
    </div>
  </div>
</template>

<style scoped>
.data-state {
  height: 100%;
  position: relative;
}

.data-state__message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--app-text-muted);
}

.data-state__message.is-error {
  color: var(--app-danger);
}

.data-state__code {
  font-size: 11px;
  color: var(--app-text-muted);
  user-select: all;
}

.data-state__params {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.data-state__loading {
  padding: 12px;
}

.data-state__content {
  height: 100%;
  transition: opacity 0.15s;
}

.data-state__content.is-refetching > :first-child {
  opacity: 0.55;
}

.data-state__spinner {
  position: absolute;
  top: 8px;
  right: 8px;
}
</style>

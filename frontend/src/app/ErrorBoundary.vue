<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NResult } from 'naive-ui'
import { describeError } from '@/ui/useApiErrorNotifier'

/**
 * Catches render and lifecycle errors in the routed page so one broken page shows a
 * recoverable error instead of a blank app. Resets when the route changes.
 */
const error = ref<unknown>(null)
const route = useRoute()

onErrorCaptured((err) => {
  error.value = err
  console.error(err)
  return false
})

watch(
  () => route.fullPath,
  () => {
    error.value = null
  },
)

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div v-if="error" class="error-boundary">
    <NResult status="error" title="Something went wrong" :description="describeError(error)">
      <template #footer>
        <NButton type="primary" @click="reload">Reload page</NButton>
      </template>
    </NResult>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 16px;
}
</style>

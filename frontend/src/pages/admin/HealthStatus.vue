<script setup lang="ts">
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import { CircleCheck, CircleExclamationPoint, CircleX } from '@lucide/vue'
import type { HealthStatus } from '@/api/admin'
import { STATUS } from '@/ui/vizPalette'

/** Status with icon + label + color (never color alone). */
const props = defineProps<{ status: HealthStatus }>()
const look = computed(
  () =>
    ({
      ok: { icon: CircleCheck, label: 'OK', color: STATUS.good },
      degraded: { icon: CircleExclamationPoint, label: 'Degraded', color: STATUS.warning },
      down: { icon: CircleX, label: 'Down', color: STATUS.critical },
    })[props.status],
)
</script>

<template>
  <span class="status" :data-status="status" data-testid="health-status">
    <NIcon :color="look.color" :size="16"><component :is="look.icon" /></NIcon>
    {{ look.label }}
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
</style>

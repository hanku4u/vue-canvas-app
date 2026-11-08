<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NIcon, NSpin, NTooltip } from 'naive-ui'
import { Check, CloudOff, TriangleExclamationPoint } from '@lucide/vue'
import type { SaveStatus } from '@/sync/canvasSync'

const props = defineProps<{ status: SaveStatus; error?: string | null }>()
const emit = defineEmits<{ 'open-conflict': []; retry: [] }>()

const view = computed(() => {
  switch (props.status) {
    case 'saved':
      return { text: 'Saved', tone: 'muted', tip: 'All changes are saved.' }
    case 'pending':
    case 'saving':
      return { text: 'Saving…', tone: 'muted', tip: 'Saving your changes.' }
    case 'offline':
      return {
        text: 'Offline – retrying',
        tone: 'warning',
        tip: 'Could not reach the server. Your changes are kept and will be saved automatically.',
      }
    case 'conflict':
      return {
        text: 'Conflict',
        tone: 'error',
        tip: 'Someone else changed a component you edited. Click to resolve.',
      }
    case 'error':
      return {
        text: 'Not saved',
        tone: 'error',
        tip: `The server refused the change${props.error ? `: ${props.error}` : ''}.`,
      }
  }
  return { text: '', tone: 'muted', tip: '' }
})

function onClick(): void {
  if (props.status === 'conflict') emit('open-conflict')
  else if (props.status === 'offline' || props.status === 'error') emit('retry')
}
</script>

<template>
  <NTooltip>
    <template #trigger>
      <NButton
        text
        size="small"
        class="save-status"
        :class="`save-status--${view.tone}`"
        data-testid="save-status"
        :data-status="status"
        @click="onClick"
      >
        <template #icon>
          <NSpin v-if="status === 'saving' || status === 'pending'" :size="12" />
          <NIcon aria-hidden="true" v-else-if="status === 'saved'"><Check /></NIcon>
          <NIcon aria-hidden="true" v-else-if="status === 'offline'"><CloudOff /></NIcon>
          <NIcon aria-hidden="true" v-else><TriangleExclamationPoint /></NIcon>
        </template>
        {{ view.text }}
      </NButton>
    </template>
    {{ view.tip }}
  </NTooltip>
</template>

<style scoped>
.save-status {
  font-size: 12px;
}

.save-status--muted {
  color: var(--app-text-muted);
}

.save-status--warning {
  color: #d97706;
}

.save-status--error {
  color: var(--app-danger);
}
</style>

<script setup lang="ts">
import { NIcon, NTooltip } from 'naive-ui'
import { paletteDefinitions } from '@/registry/registry'
import { PALETTE_MIME } from './palette'

const emit = defineEmits<{ add: [type: string] }>()

const items = paletteDefinitions()

function onDragStart(event: DragEvent, type: string): void {
  if (!event.dataTransfer) return
  event.dataTransfer.setData(PALETTE_MIME, type)
  event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <nav class="palette" aria-label="Component palette" data-testid="palette">
    <NTooltip v-for="item in items" :key="item.type" placement="right">
      <template #trigger>
        <button
          type="button"
          class="palette__item"
          draggable="true"
          :data-testid="`palette-${item.type}`"
          @click="emit('add', item.type)"
          @dragstart="onDragStart($event, item.type)"
        >
          <NIcon :size="18"><component :is="item.icon" /></NIcon>
          <span>{{ item.label }}</span>
        </button>
      </template>
      {{ item.description }} Click to add, or drag onto the canvas.
    </NTooltip>
    <p class="palette__soon">Chart, table and wafer map arrive with the data components (F6–F9).</p>
  </nav>
</template>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.palette__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--app-text);
  font: inherit;
  text-align: left;
  cursor: grab;
}

.palette__item:hover,
.palette__item:focus-visible {
  border-color: var(--app-border);
  background: var(--app-bg);
  outline: none;
}

.palette__item :deep(.n-icon) {
  color: var(--app-primary);
}

.palette__soon {
  margin: 8px 4px 0;
  font-size: 12px;
  color: var(--app-text-muted);
}
</style>

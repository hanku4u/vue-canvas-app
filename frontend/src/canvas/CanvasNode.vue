<script setup lang="ts">
import { computed } from 'vue'
import { NodeResizer, type OnResizeStart } from '@vue-flow/node-resizer'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { MIN_SIZE, snapRect } from './geometry'
import { altPressed } from './modifiers'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  id: string
  selected: boolean
  dragging?: boolean
  data: { componentId: string }
}>()

const store = useCanvasDocStore()
const component = computed(() => store.components[props.data.componentId])
const editable = computed(() => store.canEdit && !!component.value?.access.canEdit)

function onResizeEnd({ params }: OnResizeStart): void {
  const rect = snapRect(
    { x: params.x, y: params.y, w: params.width, h: params.height },
    !altPressed.value,
  )
  store.updateGeometry([{ id: props.id, ...rect }])
}
</script>

<template>
  <NodeResizer
    v-if="editable"
    :is-visible="selected"
    :min-width="MIN_SIZE.w"
    :min-height="MIN_SIZE.h"
    color="var(--app-primary)"
    @resize-end="onResizeEnd"
  />
  <div
    v-if="component"
    class="canvas-node"
    :class="{ 'is-selected': selected, 'is-dragging': dragging }"
    :data-testid="`node-${component.id}`"
  >
    <header class="canvas-node__header">
      <span class="canvas-node__title">{{ component.title }}</span>
      <span v-if="!editable" class="canvas-node__badge">view only</span>
    </header>
    <div class="canvas-node__body">
      <span class="canvas-node__type">{{ component.type }}</span>
      <span class="canvas-node__size">{{ component.w }} × {{ component.h }}</span>
    </div>
  </div>
</template>

<style scoped>
.canvas-node {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
  transition: box-shadow 0.15s;
}

.canvas-node.is-selected {
  border-color: var(--app-primary);
  box-shadow: 0 0 0 1px var(--app-primary);
}

.canvas-node.is-dragging {
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.canvas-node__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border-bottom: 1px solid var(--app-border);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.canvas-node__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-node__badge {
  font-size: 11px;
  font-weight: 400;
  color: var(--app-text-muted);
}

.canvas-node__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--app-text-muted);
  font-size: 12px;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 10px,
    color-mix(in srgb, var(--app-border) 35%, transparent) 10px 11px
  );
}

.canvas-node__type {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { Panel, useVueFlow } from '@vue-flow/core'
import { NButton, NButtonGroup, NIcon, NTooltip } from 'naive-ui'
import { Maximize, Minus, Plus } from '@lucide/vue'

const props = defineProps<{ flowId: string }>()

const emit = defineEmits<{ fit: [] }>()

const { viewport, zoomIn, zoomOut, zoomTo } = useVueFlow(props.flowId)

const percent = computed(() => `${Math.round(viewport.value.zoom * 100)}%`)
const duration = 150
</script>

<template>
  <Panel position="bottom-left" class="zoom-controls">
    <NButtonGroup size="small">
      <NTooltip placement="top">
        <template #trigger>
          <NButton aria-label="Zoom out" data-testid="zoom-out" @click="zoomOut({ duration })">
            <template #icon>
              <NIcon><Minus /></NIcon>
            </template>
          </NButton>
        </template>
        Zoom out (−)
      </NTooltip>
      <NTooltip placement="top">
        <template #trigger>
          <NButton
            class="zoom-controls__level"
            data-testid="zoom-level"
            @click="zoomTo(1, { duration })"
          >
            {{ percent }}
          </NButton>
        </template>
        Reset to 100% (Ctrl/⌘ + 0)
      </NTooltip>
      <NTooltip placement="top">
        <template #trigger>
          <NButton aria-label="Zoom in" data-testid="zoom-in" @click="zoomIn({ duration })">
            <template #icon>
              <NIcon><Plus /></NIcon>
            </template>
          </NButton>
        </template>
        Zoom in (+)
      </NTooltip>
      <NTooltip placement="top">
        <template #trigger>
          <NButton aria-label="Zoom to fit" data-testid="zoom-fit" @click="emit('fit')">
            <template #icon>
              <NIcon><Maximize /></NIcon>
            </template>
          </NButton>
        </template>
        Zoom to fit (Shift + 1)
      </NTooltip>
    </NButtonGroup>
  </Panel>
</template>

<style scoped>
.zoom-controls__level {
  min-width: 58px;
  font-variant-numeric: tabular-nums;
}
</style>

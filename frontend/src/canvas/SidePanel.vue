<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NIcon, NTooltip } from 'naive-ui'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from '@lucide/vue'

/** A collapsible editor side panel; the collapsed state is remembered per browser. */
const props = defineProps<{
  side: 'left' | 'right'
  title: string
  storageKey: string
  width?: number
}>()

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(props.storageKey) === 'collapsed'
  } catch {
    return false
  }
}

const collapsed = ref(readCollapsed())

watch(collapsed, (value) => {
  try {
    localStorage.setItem(props.storageKey, value ? 'collapsed' : 'open')
  } catch {
    // Not persisted.
  }
})

const toggleIcon = computed(() => {
  if (props.side === 'left') return collapsed.value ? PanelLeftOpen : PanelLeftClose
  return collapsed.value ? PanelRightOpen : PanelRightClose
})
</script>

<template>
  <aside
    class="side-panel"
    :class="[`side-panel--${side}`, { 'is-collapsed': collapsed }]"
    :style="{ width: collapsed ? undefined : `${width ?? 240}px` }"
    :aria-label="title"
    :data-testid="`panel-${side}`"
  >
    <div class="side-panel__header">
      <span v-if="!collapsed" class="side-panel__title">{{ title }}</span>
      <NTooltip :placement="side === 'left' ? 'right' : 'left'">
        <template #trigger>
          <NButton
            quaternary
            size="tiny"
            :aria-label="`${collapsed ? 'Show' : 'Hide'} ${title.toLowerCase()}`"
            :data-testid="`panel-${side}-toggle`"
            @click="collapsed = !collapsed"
          >
            <template #icon>
              <NIcon aria-hidden="true"><component :is="toggleIcon" /></NIcon>
            </template>
          </NButton>
        </template>
        {{ collapsed ? 'Show' : 'Hide' }} {{ title.toLowerCase() }}
      </NTooltip>
    </div>
    <div v-show="!collapsed" class="side-panel__body">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.side-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
  background: var(--app-panel-bg);
}

.side-panel--left {
  border-right: 1px solid var(--app-border);
}

.side-panel--right {
  border-left: 1px solid var(--app-border);
}

.side-panel.is-collapsed {
  width: 36px;
}

.side-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 36px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.side-panel.is-collapsed .side-panel__header {
  justify-content: center;
  padding: 0;
}

.side-panel__title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--app-text-muted);
}

.side-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>

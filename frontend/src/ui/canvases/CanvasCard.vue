<script setup lang="ts">
import { computed, h, type Component } from 'vue'
import { NButton, NDropdown, NIcon, NTag, NTooltip, type DropdownOption } from 'naive-ui'
import { Copy, Ellipsis, FolderOpen, Pencil, Trash } from '@lucide/vue'
import type { CanvasSummary } from '@/api/types'
import { formatDateTime, formatRelativeTime, pluralize } from '@/ui/format'
import { canvasCan, roleLabel } from './permissions'

export type CanvasCardAction = 'open' | 'rename' | 'duplicate' | 'delete'

const props = defineProps<{ canvas: CanvasSummary; showOwner?: boolean }>()
const emit = defineEmits<{ action: [action: CanvasCardAction, canvas: CanvasSummary] }>()

function icon(component: Component) {
  return () => h(NIcon, null, { default: () => h(component, { size: 16 }) })
}

const menu = computed<DropdownOption[]>(() => {
  const role = props.canvas.role
  const items: DropdownOption[] = [{ key: 'open', label: 'Open', icon: icon(FolderOpen) }]
  if (canvasCan.edit(role)) items.push({ key: 'rename', label: 'Rename', icon: icon(Pencil) })
  if (canvasCan.duplicate(role)) {
    items.push({ key: 'duplicate', label: 'Duplicate', icon: icon(Copy) })
  }
  if (canvasCan.delete(role)) {
    items.push({ key: 'd', type: 'divider' })
    items.push({
      key: 'delete',
      label: () => h('span', { style: 'color: var(--app-danger)' }, 'Delete'),
      icon: icon(Trash),
    })
  }
  return items
})

const roleType = computed(() => (props.canvas.role === 'viewer' ? 'default' : 'info'))

function open(): void {
  emit('action', 'open', props.canvas)
}
</script>

<template>
  <article
    class="canvas-card"
    tabindex="0"
    :data-testid="`canvas-card-${canvas.id}`"
    :aria-label="canvas.title"
    @click="open"
    @keydown.enter.self="open"
  >
    <div class="canvas-card__head">
      <h3 class="canvas-card__title" :title="canvas.title">{{ canvas.title }}</h3>
      <NDropdown
        trigger="click"
        placement="bottom-end"
        :options="menu"
        @select="(key: CanvasCardAction) => emit('action', key, canvas)"
      >
        <NButton
          quaternary
          circle
          size="small"
          aria-label="Canvas actions"
          data-testid="canvas-card-menu"
          @click.stop
        >
          <template #icon>
            <NIcon><Ellipsis /></NIcon>
          </template>
        </NButton>
      </NDropdown>
    </div>
    <p class="canvas-card__description" :class="{ 'is-empty': !canvas.description }">
      {{ canvas.description || 'No description' }}
    </p>
    <footer class="canvas-card__meta">
      <span v-if="showOwner">by {{ canvas.owner.displayName }}</span>
      <NTag v-if="showOwner" size="tiny" :type="roleType" :bordered="false">
        {{ roleLabel[canvas.role] }}
      </NTag>
      <span>{{ pluralize(canvas.componentCount, 'component') }}</span>
      <NTooltip>
        <template #trigger>
          <span>edited {{ formatRelativeTime(canvas.updatedAt) }}</span>
        </template>
        {{ formatDateTime(canvas.updatedAt) }}
      </NTooltip>
    </footer>
  </article>
</template>

<style scoped>
.canvas-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 132px;
  padding: 14px 12px 12px 16px;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.canvas-card:hover,
.canvas-card:focus-visible {
  border-color: var(--app-primary);
  box-shadow: 0 2px 10px rgb(0 0 0 / 8%);
  outline: none;
}

.canvas-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.canvas-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-card__description {
  flex: 1;
  margin: 0;
  color: var(--app-text-muted);
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.canvas-card__description.is-empty {
  font-style: italic;
  opacity: 0.7;
}

.canvas-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 12px;
  color: var(--app-text-muted);
}
</style>

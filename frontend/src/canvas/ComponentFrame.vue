<script setup lang="ts">
import { computed, h, onErrorCaptured, ref, watch, type Component } from 'vue'
import { NodeResizer, type OnResizeStart } from '@vue-flow/node-resizer'
import { NButton, NDropdown, NIcon, NTooltip, type DropdownOption } from 'naive-ui'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CircleQuestionMark,
  Copy,
  Ellipsis,
  EyeOff,
  Lock,
  ShieldUser,
  RotateCw,
  SearchCode,
  Trash,
  TriangleExclamationPoint,
  Funnel,
} from '@lucide/vue'
import { useFilterDimensions } from '@/filters/dimensions'
import { levelLabel } from '@/filters/resolve'
import { describeFilter } from '@/filters/values'
import { getDefinition, resolveConfig } from '@/registry/registry'
import type { ComponentConfig } from '@/registry/types'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { useCanvasUiStore } from '@/stores/canvasUi'
import { useComponentDataStore } from '@/stores/componentData'
import { formatDateTime } from '@/ui/format'
import { shortAge, useNow } from '@/ui/useNow'
import QueryDetailsDialog from './QueryDetailsDialog.vue'
import { menuLabel } from '@/ui/menuLabel'
import { MIN_SIZE, snapRect } from './geometry'
import { useLevelOfDetail } from './lod'
import { altPressed } from './modifiers'

defineOptions({ inheritAttrs: false })

/** Vue Flow node props (only the ones used here). */
const props = defineProps<{
  id: string
  selected: boolean
  dragging?: boolean
  data: { componentId: string }
}>()

const store = useCanvasDocStore()
const ui = useCanvasUiStore()
const lod = useLevelOfDetail()
const dataStore = useComponentDataStore()
const now = useNow()

/** Query state published by data components (useComponentQuery). */
const dataInfo = computed(() => dataStore.byId.get(props.id))
const dataAge = computed(() => shortAge(dataInfo.value?.meta?.asOf, now.value))
const showDetails = ref(false)

// Footer: the filters this component follows right now (docs/canvas-ux.md, Filters).
const dimensions = useFilterDimensions()
const activeFilters = computed(() => {
  const seen = new Set<string>()
  const out: { dimension: string; label: string; value: string; title: string }[] = []
  for (const b of dataInfo.value?.bindings ?? []) {
    if (!b.level || !b.value || seen.has(b.dimension)) continue
    seen.add(b.dimension)
    const label = dimensions.data.value?.find((d) => d.id === b.dimension)?.label ?? b.dimension
    const from = b.source ? store.components[b.source]?.title : undefined
    out.push({
      dimension: b.dimension,
      label,
      value: describeFilter(b.value),
      title: `${label} filter from the ${levelLabel(b.level)}${from ? ` (selected in “${from}”)` : ''}`,
    })
  }
  return out
})

const component = computed(() => store.components[props.data.componentId])
const definition = computed(() =>
  component.value ? getDefinition(component.value.type) : undefined,
)
const editable = computed(() => store.canEdit && !!component.value?.access.canEdit)
const active = computed(() => ui.activeId === props.id)
const resolved = computed(() =>
  definition.value && component.value ? resolveConfig(definition.value, component.value) : null,
)
const minSize = computed(() => definition.value?.minSize ?? MIN_SIZE)
const restricted = computed(
  () =>
    !!component.value &&
    (component.value.access.editRestricted || component.value.access.viewRestricted),
)

const body = computed<Component | undefined>(() => {
  if (!definition.value) return undefined
  return lod.value === 'preview' && definition.value.preview
    ? definition.value.preview
    : definition.value.view
})

// ---------------------------------------------------------------------------
// Errors: a crashing component shows an error in its own frame, never breaks the canvas.
// ---------------------------------------------------------------------------

const crashed = ref<string | null>(null)
const renderKey = ref(0)

onErrorCaptured((error) => {
  crashed.value = error instanceof Error ? error.message : String(error)
  console.error(error)
  return false
})

watch(
  () => component.value?.config,
  () => {
    crashed.value = null
  },
)

function retry(): void {
  crashed.value = null
  renderKey.value += 1
}

function resetConfig(): void {
  if (definition.value)
    store.updateConfig(props.id, definition.value.defaultConfig(), { replace: true })
}

function onConfigUpdate(patch: ComponentConfig): void {
  const error = store.updateConfig(props.id, patch)
  if (error) console.warn(`Rejected config change for ${props.id}: ${error}`)
}

// ---------------------------------------------------------------------------
// Geometry and menu
// ---------------------------------------------------------------------------

function onResizeEnd({ params }: OnResizeStart): void {
  const rect = snapRect(
    { x: params.x, y: params.y, w: params.width, h: params.height },
    !altPressed.value,
  )
  store.updateGeometry([
    {
      id: props.id,
      ...rect,
      w: Math.max(rect.w, minSize.value.w),
      h: Math.max(rect.h, minSize.value.h),
    },
  ])
}

function icon(c: Component) {
  return () => h(NIcon, null, { default: () => h(c, { size: 16 }) })
}

const menu = computed<DropdownOption[]>(() => {
  const items: DropdownOption[] = []
  if (dataInfo.value) {
    items.push(
      { key: 'refresh', label: menuLabel('Refresh data', { hint: 'R' }), icon: icon(RotateCw) },
      { key: 'details', label: menuLabel('View query details'), icon: icon(SearchCode) },
      { key: 'd0', type: 'divider' },
    )
  }
  if (store.canEdit)
    items.push({
      key: 'duplicate',
      label: menuLabel('Duplicate', { hint: 'Ctrl/⌘ D' }),
      icon: icon(Copy),
    })
  if (editable.value) {
    items.push(
      {
        key: 'front',
        label: menuLabel('Bring to front', { hint: ']' }),
        icon: icon(ArrowUpToLine),
      },
      { key: 'back', label: menuLabel('Send to back', { hint: '[' }), icon: icon(ArrowDownToLine) },
      { key: 'd1', type: 'divider' },
      ...(store.canManageAccess
        ? [{ key: 'access', label: menuLabel('Restrict access…'), icon: icon(ShieldUser) }]
        : []),
      {
        key: 'delete',
        label: menuLabel('Delete', { hint: 'Del', danger: true }),
        icon: icon(Trash),
      },
    )
  }
  return items
})

function onMenu(key: string): void {
  if (key === 'refresh') dataInfo.value?.refresh()
  if (key === 'details') showDetails.value = true
  if (key === 'access') ui.accessDialogFor = props.id
  if (key === 'duplicate') store.duplicateComponents([props.id])
  if (key === 'front') store.bringToFront([props.id])
  if (key === 'back') store.sendToBack([props.id])
  if (key === 'delete') store.removeComponents([props.id])
}
</script>

<template>
  <NodeResizer
    v-if="editable"
    :is-visible="selected"
    :min-width="minSize.w"
    :min-height="minSize.h"
    color="var(--app-primary)"
    @resize-end="onResizeEnd"
  />
  <div
    v-if="component"
    class="frame"
    :class="{
      'is-selected': selected,
      'is-active': active,
      'is-dragging': dragging,
      'is-highlighted': ui.highlightId === component.id,
    }"
    :data-testid="`node-${component.id}`"
    :data-type="component.type"
    :data-lod="lod"
  >
    <header class="frame__header">
      <NIcon class="frame__icon" :size="15">
        <component :is="definition?.icon ?? CircleQuestionMark" />
      </NIcon>
      <span class="frame__title" :title="component.title">{{ component.title }}</span>
      <NTooltip v-if="dataInfo && (dataAge || dataInfo.fetching)">
        <template #trigger>
          <NButton
            text
            size="tiny"
            class="frame__age nodrag"
            :class="{ 'is-fetching': dataInfo.fetching }"
            aria-label="Refresh data"
            data-testid="frame-refresh"
            @click.stop="dataInfo.refresh()"
          >
            <template #icon>
              <NIcon :size="12"><RotateCw /></NIcon>
            </template>
            <span data-testid="frame-age">{{ dataAge }}</span>
          </NButton>
        </template>
        <template v-if="dataInfo.meta">
          Data from {{ formatDateTime(dataInfo.meta.asOf)
          }}{{ dataInfo.meta.cacheHit ? ' (cached)' : '' }}. Click to refresh.
        </template>
        <template v-else>Loading…</template>
      </NTooltip>
      <NTooltip v-if="component.access.viewRestricted && editable">
        <template #trigger>
          <span class="frame__marker" data-testid="frame-hidden">
            <NIcon :size="13"><EyeOff /></NIcon>
          </span>
        </template>
        Hidden from everyone not on its access list.
      </NTooltip>
      <NTooltip v-if="(restricted && !component.access.viewRestricted) || !editable">
        <template #trigger>
          <span class="frame__marker" data-testid="frame-lock">
            <NIcon :size="13"><Lock /></NIcon>
            <span v-if="!editable">view only</span>
          </span>
        </template>
        <template v-if="!editable && store.canEdit">This component is locked for you.</template>
        <template v-else-if="!editable">You can view this canvas but not change it.</template>
        <template v-else>Access to this component is restricted.</template>
      </NTooltip>
      <QueryDetailsDialog
        v-if="dataInfo"
        v-model:show="showDetails"
        :title="component.title"
        :info="dataInfo"
      />
      <NDropdown
        v-if="menu.length"
        trigger="click"
        placement="bottom-end"
        :options="menu"
        @select="onMenu"
      >
        <NButton
          quaternary
          circle
          size="tiny"
          class="frame__menu nodrag"
          aria-label="Component actions"
          data-testid="frame-menu"
          @click.stop
        >
          <template #icon>
            <NIcon><Ellipsis /></NIcon>
          </template>
        </NButton>
      </NDropdown>
    </header>

    <div class="frame__body" :class="{ 'nodrag nowheel': active }">
      <div v-if="!definition" class="frame__problem">
        <NIcon :size="20"><CircleQuestionMark /></NIcon>
        <span>Unknown component type “{{ component.type }}”</span>
      </div>
      <div v-else-if="crashed" class="frame__problem" data-testid="frame-crashed">
        <NIcon :size="20"><TriangleExclamationPoint /></NIcon>
        <span>This component failed to render: {{ crashed }}</span>
        <NButton size="tiny" @click="retry">Retry</NButton>
      </div>
      <div v-else-if="resolved && !resolved.ok" class="frame__problem" data-testid="frame-invalid">
        <NIcon :size="20"><TriangleExclamationPoint /></NIcon>
        <span>Invalid settings: {{ resolved.error }}</span>
        <NButton v-if="editable" size="tiny" @click="resetConfig">Reset to defaults</NButton>
      </div>
      <component
        :is="body"
        v-else-if="resolved"
        :key="renderKey"
        :component="component"
        :config="resolved.config"
        :editable="editable"
        :active="active"
        @update-config="onConfigUpdate"
      />
    </div>
    <footer
      v-if="activeFilters.length && lod === 'full'"
      class="frame__footer"
      data-testid="frame-filters"
    >
      <span
        v-for="f in activeFilters"
        :key="f.dimension"
        class="frame__filter"
        :data-dimension="f.dimension"
        :title="f.title"
      >
        <NIcon :size="11"><Funnel /></NIcon>{{ f.label }}: {{ f.value }}
      </span>
    </footer>
  </div>
</template>

<style scoped>
.frame {
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

.frame.is-selected {
  border-color: var(--app-primary);
  box-shadow: 0 0 0 1px var(--app-primary);
}

.frame.is-active {
  box-shadow:
    0 0 0 1px var(--app-primary),
    0 0 0 4px color-mix(in srgb, var(--app-primary) 25%, transparent);
}

.frame.is-highlighted {
  box-shadow:
    0 0 0 2px var(--app-primary),
    0 0 0 6px color-mix(in srgb, var(--app-primary) 30%, transparent);
}

.frame__footer {
  display: flex;
  gap: 10px;
  overflow: hidden;
  height: 22px;
  padding: 0 10px;
  align-items: center;
  border-top: 1px solid var(--app-border);
  font-size: 11px;
  color: var(--app-text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

.frame__filter {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.frame.is-dragging {
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.frame__header {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 4px 0 10px;
  border-bottom: 1px solid var(--app-border);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
  cursor: grab;
}

.frame__icon {
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.frame__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame__age {
  font-size: 11px;
  font-weight: 400;
  color: var(--app-text-muted);
}

.frame__age.is-fetching :deep(.n-icon) {
  animation: frame-spin 0.9s linear infinite;
}

@keyframes frame-spin {
  to {
    transform: rotate(360deg);
  }
}

.frame__marker {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 400;
  color: var(--app-text-muted);
  white-space: nowrap;
}

.frame__menu {
  flex-shrink: 0;
}

.frame__body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.frame__problem {
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
</style>

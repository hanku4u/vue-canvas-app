<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  VueFlow,
  useVueFlow,
  type GraphNode,
  type Node,
  type NodeDragEvent,
  type NodeMouseEvent,
  type ViewportTransform,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { NDropdown, type DropdownOption } from 'naive-ui'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'

import { isDark } from '@/app/colorScheme'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { menuLabel } from '@/ui/menuLabel'
import CanvasNode from './CanvasNode.vue'
import ZoomControls from './ZoomControls.vue'
import { DEFAULT_SIZE, GRID, MAX_ZOOM, MIN_ZOOM, snap } from './geometry'
import { altPressed, useModifierKeys } from './modifiers'
import { useShortcuts, type Shortcut } from './shortcuts'
import { loadViewport, saveViewport } from './viewportStorage'

const props = defineProps<{ canvasId: string }>()

const store = useCanvasDocStore()
const flowId = `canvas-${props.canvasId}`
const {
  addSelectedNodes,
  removeSelectedNodes,
  getNodes,
  getSelectedNodes,
  fitBounds,
  zoomIn,
  zoomOut,
  zoomTo,
  project,
  viewport,
  vueFlowRef,
} = useVueFlow(flowId)

useModifierKeys()

const savedViewport = loadViewport(props.canvasId)
const canEdit = computed(() => store.canEdit)

// ---------------------------------------------------------------------------
// Store → Vue Flow nodes. Vue Flow owns positions during a gesture; the store is
// updated when the gesture ends, which is also when F4 will emit an op.
// ---------------------------------------------------------------------------

// shallowRef: Vue Flow's Node type is too deep for ref() unwrapping, and the array is
// always replaced wholesale. Vue Flow keeps each node's selection across replacements (by id).
const nodes = shallowRef<Node[]>([])

function rebuildNodes(): void {
  nodes.value = store.ordered.map((c) => ({
    id: c.id,
    type: 'component',
    position: { x: c.x, y: c.y },
    width: c.w,
    height: c.h,
    zIndex: c.zIndex,
    draggable: canEdit.value && c.access.canEdit,
    data: { componentId: c.id },
  }))
}

watch(() => store.revision, rebuildNodes, { immediate: true })

/**
 * Fit the viewport to components, using geometry from the store rather than Vue Flow's
 * measured DOM sizes (off-screen nodes are never rendered, so never measured).
 */
function fitTo(ids?: string[], options: { maxZoom?: number; duration?: number } = {}): void {
  const targets = store.ordered.filter((c) => !ids || ids.includes(c.id))
  if (!targets.length) return
  const x = Math.min(...targets.map((c) => c.x))
  const y = Math.min(...targets.map((c) => c.y))
  const width = Math.max(...targets.map((c) => c.x + c.w)) - x
  const height = Math.max(...targets.map((c) => c.y + c.h)) - y
  const maxZoom = options.maxZoom ?? 1
  // Pad around the content, and don't zoom in past maxZoom for small content.
  const bounds = vueFlowRef.value?.getBoundingClientRect()
  const fitZoom = bounds ? Math.min(bounds.width / width, bounds.height / height) / 1.15 : maxZoom
  const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, fitZoom))
  const viewW = (bounds?.width ?? width) / zoom
  const viewH = (bounds?.height ?? height) / zoom
  void fitBounds(
    { x: x + width / 2 - viewW / 2, y: y + height / 2 - viewH / 2, width: viewW, height: viewH },
    { padding: 0, duration: options.duration },
  )
}

const fitAll = (duration = 200) => fitTo(undefined, { duration })

function onInit(): void {
  if (!savedViewport) fitAll(0)
}

function onDragStop({ nodes: dragged }: NodeDragEvent): void {
  store.updateGeometry(dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })))
}

// Persist the viewport after it settles. Watched (not the viewportChangeEnd event) because
// programmatic changes (zoom buttons, shortcuts, fit) don't emit that event.
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => ({ ...viewport.value }),
  (value: ViewportTransform) => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveViewport(props.canvasId, value), 300)
  },
)
onBeforeUnmount(() => clearTimeout(saveTimer))

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

const selectedIds = () => getSelectedNodes.value.map((n) => n.id)

function selectOnly(ids: string[]): void {
  removeSelectedNodes(getSelectedNodes.value)
  addSelectedNodes(getNodes.value.filter((n) => ids.includes(n.id)))
}

function deleteSelected(): void {
  store.removeComponents(selectedIds())
}

// ---------------------------------------------------------------------------
// Placeholders (stand-ins until the component registry and palette in F3)
// ---------------------------------------------------------------------------

function addPlaceholder(x: number, y: number): void {
  const component = store.addComponent({
    type: 'placeholder',
    title: `Placeholder ${store.ordered.length + 1}`,
    x: snap(x),
    y: snap(y),
    ...DEFAULT_SIZE,
  })
  if (component) void nextTick(() => selectOnly([component.id]))
}

function addPlaceholderGrid(originX: number, originY: number, count = 50): void {
  const columns = 10
  for (let i = 0; i < count; i += 1) {
    store.addComponent({
      type: 'placeholder',
      title: `Placeholder ${store.ordered.length + 1}`,
      x: snap(originX + (i % columns) * (DEFAULT_SIZE.w + 2 * GRID)),
      y: snap(originY + Math.floor(i / columns) * (DEFAULT_SIZE.h + 2 * GRID)),
      ...DEFAULT_SIZE,
    })
  }
  fitAll()
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

const menu = ref({ show: false, x: 0, y: 0, kind: 'pane' as 'pane' | 'node', flowX: 0, flowY: 0 })

function toFlow(event: MouseEvent): { x: number; y: number } {
  const bounds = vueFlowRef.value?.getBoundingClientRect()
  return project({ x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) })
}

function openMenu(event: MouseEvent, kind: 'pane' | 'node'): void {
  event.preventDefault()
  const flow = toFlow(event)
  menu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    kind,
    flowX: flow.x,
    flowY: flow.y,
  }
}

function onPaneMenu(event: MouseEvent): void {
  openMenu(event, 'pane')
}

function onNodeMenu({ event, node }: NodeMouseEvent): void {
  if (!node.selected) selectOnly([node.id])
  openMenu(event as MouseEvent, 'node')
}

function closeMenu(): void {
  menu.value.show = false
}

const menuOptions = computed<DropdownOption[]>(() => {
  if (menu.value.kind === 'node') {
    const editableSelected = getSelectedNodes.value.some((n: GraphNode) => n.draggable)
    return [
      {
        key: 'front',
        label: menuLabel('Bring to front', { hint: ']' }),
        disabled: !editableSelected,
      },
      { key: 'back', label: menuLabel('Send to back', { hint: '[' }), disabled: !editableSelected },
      { key: 'd1', type: 'divider' },
      {
        key: 'delete',
        label: menuLabel('Delete', { hint: 'Del', danger: editableSelected }),
        disabled: !editableSelected,
      },
    ]
  }
  const items: DropdownOption[] = []
  if (canEdit.value) {
    items.push({ key: 'add', label: menuLabel('Add placeholder here') })
    if (import.meta.env.DEV) {
      items.push({ key: 'add-50', label: menuLabel('Add 50 placeholders (dev)') })
    }
    items.push({ key: 'd1', type: 'divider' })
  }
  items.push(
    { key: 'select-all', label: menuLabel('Select all', { hint: 'Ctrl/⌘ A' }) },
    { key: 'fit', label: menuLabel('Zoom to fit', { hint: 'Shift 1' }) },
    { key: 'reset-zoom', label: menuLabel('Zoom to 100%', { hint: 'Ctrl/⌘ 0' }) },
  )
  return items
})

function onMenuSelect(key: string): void {
  closeMenu()
  const ids = selectedIds()
  switch (key) {
    case 'add':
      addPlaceholder(menu.value.flowX, menu.value.flowY)
      break
    case 'add-50':
      addPlaceholderGrid(menu.value.flowX, menu.value.flowY)
      break
    case 'select-all':
      addSelectedNodes(getNodes.value)
      break
    case 'fit':
      fitAll()
      break
    case 'reset-zoom':
      void zoomTo(1, { duration: 150 })
      break
    case 'front':
      store.bringToFront(ids)
      break
    case 'back':
      store.sendToBack(ids)
      break
    case 'delete':
      deleteSelected()
      break
  }
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts (docs/canvas-ux.md)
// ---------------------------------------------------------------------------

function nudge(dx: number, dy: number) {
  return (event: KeyboardEvent) => {
    const step = event.shiftKey ? GRID * 10 : GRID
    store.nudge(selectedIds(), dx * step, dy * step)
  }
}

const shortcuts = (): Shortcut[] => [
  {
    combo: 'mod+a',
    description: 'Select all',
    handler: () => addSelectedNodes(getNodes.value),
  },
  {
    combo: 'escape',
    description: 'Clear selection',
    handler: () => {
      closeMenu()
      removeSelectedNodes(getSelectedNodes.value)
    },
  },
  { combo: ['delete', 'backspace'], description: 'Delete selection', handler: deleteSelected },
  { combo: ['arrowup', 'shift+arrowup'], description: 'Nudge up', handler: nudge(0, -1) },
  { combo: ['arrowdown', 'shift+arrowdown'], description: 'Nudge down', handler: nudge(0, 1) },
  { combo: ['arrowleft', 'shift+arrowleft'], description: 'Nudge left', handler: nudge(-1, 0) },
  { combo: ['arrowright', 'shift+arrowright'], description: 'Nudge right', handler: nudge(1, 0) },
  { combo: ']', description: 'Bring to front', handler: () => store.bringToFront(selectedIds()) },
  { combo: '[', description: 'Send to back', handler: () => store.sendToBack(selectedIds()) },
  { combo: ['+', '='], description: 'Zoom in', handler: () => void zoomIn({ duration: 150 }) },
  { combo: ['-', '_'], description: 'Zoom out', handler: () => void zoomOut({ duration: 150 }) },
  {
    combo: 'shift+1',
    description: 'Zoom to fit',
    handler: () => fitAll(),
  },
  {
    combo: 'shift+2',
    description: 'Zoom to selection',
    handler: () => {
      const ids = selectedIds()
      if (ids.length) fitTo(ids, { maxZoom: 1.5, duration: 200 })
    },
  },
  { combo: 'mod+0', description: 'Zoom to 100%', handler: () => void zoomTo(1, { duration: 150 }) },
]

useShortcuts(shortcuts)

const patternColor = computed(() => (isDark.value ? '#3f3f46' : '#cbd5e1'))
const minimapMask = computed(() => (isDark.value ? 'rgb(0 0 0 / 55%)' : 'rgb(240 242 247 / 70%)'))
</script>

<template>
  <div class="canvas-view" :class="{ 'is-readonly': !canEdit }" data-testid="canvas-view">
    <VueFlow
      :id="flowId"
      v-model:nodes="nodes"
      :default-viewport="savedViewport ?? { x: 0, y: 0, zoom: 1 }"
      :min-zoom="MIN_ZOOM"
      :max-zoom="MAX_ZOOM"
      :snap-to-grid="!altPressed"
      :snap-grid="[GRID, GRID]"
      :only-render-visible-elements="true"
      :pan-on-drag="[0, 1]"
      :pan-on-scroll="true"
      :zoom-on-scroll="false"
      :zoom-on-pinch="true"
      :zoom-on-double-click="false"
      :zoom-activation-key-code="['Control', 'Meta']"
      :multi-selection-key-code="['Shift', 'Control', 'Meta']"
      :delete-key-code="null"
      :nodes-draggable="canEdit"
      :nodes-connectable="false"
      :elevate-nodes-on-select="false"
      :disable-keyboard-a11y="true"
      @init="onInit"
      @node-drag-stop="onDragStop"
      @pane-context-menu="onPaneMenu"
      @node-context-menu="onNodeMenu"
      @pane-click="closeMenu"
    >
      <template #node-component="nodeProps">
        <CanvasNode v-bind="nodeProps" />
      </template>

      <Background variant="dots" :gap="GRID" :size="1.3" :pattern-color="patternColor" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        :width="180"
        :height="120"
        :node-border-radius="6"
        :mask-color="minimapMask"
        node-color="var(--app-border)"
        node-stroke-color="var(--app-text-muted)"
        aria-label="Canvas overview"
      />
      <ZoomControls :flow-id="flowId" @fit="fitAll()" />
    </VueFlow>

    <div v-if="!nodes.length" class="canvas-view__empty" data-testid="canvas-empty">
      <p v-if="canEdit">Right-click the canvas to add a placeholder.</p>
      <p v-else>This canvas is empty.</p>
      <p class="canvas-view__hint">The component palette arrives in roadmap milestone F3.</p>
    </div>

    <NDropdown
      trigger="manual"
      placement="bottom-start"
      :show="menu.show"
      :x="menu.x"
      :y="menu.y"
      :options="menuOptions"
      :on-clickoutside="closeMenu"
      data-testid="canvas-context-menu"
      @select="onMenuSelect"
    />
  </div>
</template>

<style scoped>
.canvas-view {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--app-bg);
}

.canvas-view__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: var(--app-text-muted);
}

.canvas-view__empty p {
  margin: 0;
}

.canvas-view__hint {
  font-size: 12px;
  opacity: 0.8;
}

.canvas-view :deep(.vue-flow__minimap) {
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  overflow: hidden;
}

.canvas-view :deep(.vue-flow__selection),
.canvas-view :deep(.vue-flow__nodesselection-rect) {
  background: color-mix(in srgb, var(--app-primary) 8%, transparent);
  border: 1px solid var(--app-primary);
}

.canvas-view :deep(.vue-flow__node) {
  border-radius: 8px;
}
</style>

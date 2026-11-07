<script setup lang="ts">
// Canvas editor: loads the canvas into the document store (which saves edits through ops),
// and lays out palette, canvas and inspector.
import { computed, h, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import {
  NButton,
  NDropdown,
  NEmpty,
  NIcon,
  NSpin,
  NTag,
  NTooltip,
  useMessage,
  type DropdownOption,
} from 'naive-ui'
import { ArrowLeft, Copy, Ellipsis, Pencil, Redo2, Share2, Trash, Undo2, Users } from '@lucide/vue'
import { useCanvas } from '@/api/canvases'
import { ApiError } from '@/api/client'
import DefaultLayout from '@/app/layout/DefaultLayout.vue'
import CanvasView from '@/canvas/CanvasView.vue'
import ConflictDialog from '@/canvas/ConflictDialog.vue'
import InspectorPanel from '@/canvas/InspectorPanel.vue'
import PalettePanel from '@/canvas/PalettePanel.vue'
import SaveStatus from '@/canvas/SaveStatus.vue'
import SidePanel from '@/canvas/SidePanel.vue'
import { registerBuiltInComponents } from '@/components'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import CanvasNameDialog from '@/ui/canvases/CanvasNameDialog.vue'
import { canvasCan, roleLabel } from '@/ui/canvases/permissions'
import { useCanvasActions } from '@/ui/canvases/useCanvasActions'
import { describeError, useApiErrorNotifier } from '@/ui/useApiErrorNotifier'
import FilterBar from '@/filters/FilterBar.vue'
import { useFilterUrl } from '@/filters/useFilterUrl'
import { useFiltersStore } from '@/stores/filters'
import { useCanvasUiStore } from '@/stores/canvasUi'
import RestrictDialog from '@/ui/sharing/RestrictDialog.vue'
import ShareDialog from '@/ui/sharing/ShareDialog.vue'
import StatusPage from './StatusPage.vue'

const props = defineProps<{ id: string }>()

// Component types must exist before the palette, canvas or inspector render.
registerBuiltInComponents()

const router = useRouter()
const message = useMessage()
const notifyError = useApiErrorNotifier()
const canvas = useCanvas(() => props.id)
const actions = useCanvasActions({ onDeleted: () => void router.push({ name: 'home' }) })

const store = useCanvasDocStore()
const ui = useCanvasUiStore()

// Sharing (canvas) and restrictions (component, opened from its menu).
const showShare = ref(false)
const restricting = computed(() =>
  ui.accessDialogFor ? store.components[ui.accessDialogFor] : undefined,
)
const showRestrict = computed({
  get: () => !!restricting.value,
  set: (open: boolean) => {
    if (!open) ui.accessDialogFor = null
  },
})

// Session filters belong to one canvas visit; canvas-level ones live in the URL.
const filterStore = useFiltersStore()
filterStore.reset()
watch(
  () => props.id,
  () => filterStore.reset(),
)
useFilterUrl()
const canvasView = ref<InstanceType<typeof CanvasView> | null>(null)

// First load replaces the document; later refetches (window focus, after a rename) are
// merged, keeping components with unsaved local edits.
watch(
  () => canvas.data.value,
  (value) => {
    if (!value) return
    if (store.canvas?.id !== value.id) store.load(value)
    else store.mergeRemote(value)
  },
  { immediate: true },
)

const ready = computed(() => !!canvas.data.value && store.canvas?.id === props.id)

const notFound = computed(
  () => canvas.error.value instanceof ApiError && canvas.error.value.status === 404,
)

// ---------------------------------------------------------------------------
// Saving: conflicts, refusals, leaving the page
// ---------------------------------------------------------------------------

const showConflict = ref(false)
watch(
  () => store.conflicts.length,
  (count) => {
    showConflict.value = count > 0
  },
)

async function reloadFromServer(): Promise<void> {
  const { data } = await canvas.refetch()
  if (data) store.load(data)
}

watch(
  () => store.rejection,
  (error) => {
    if (!error) return
    notifyError('Your last changes could not be saved', error)
    void reloadFromServer()
  },
)

function retrySave(): void {
  if (store.saveStatus === 'error') void reloadFromServer()
  else void store.flush()
}

onBeforeRouteLeave(async () => {
  await store.flush()
  if (store.dirty) {
    return window.confirm('Some changes are not saved yet. Leave anyway?')
  }
  return true
})

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (store.dirty) event.preventDefault()
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// ---------------------------------------------------------------------------
// Canvas menu
// ---------------------------------------------------------------------------

function icon(component: Component) {
  return () => h(NIcon, null, { default: () => h(component, { size: 16 }) })
}

const isMockApi = import.meta.env.VITE_API_MOCK === '1'

const menu = computed<DropdownOption[]>(() => {
  const role = canvas.data.value?.role
  if (!role) return []
  const items: DropdownOption[] = []
  if (canvasCan.manageAccess(role)) {
    items.push({ key: 'share', label: 'Share…', icon: icon(Share2) })
  }
  if (canvasCan.edit(role)) items.push({ key: 'rename', label: 'Rename', icon: icon(Pencil) })
  items.push({
    key: 'duplicate',
    label: role === 'owner' ? 'Duplicate' : 'Duplicate to my canvases',
    icon: icon(Copy),
  })
  if (canvasCan.delete(role)) items.push({ key: 'delete', label: 'Delete', icon: icon(Trash) })
  if (isMockApi) {
    items.push(
      { key: 'd-dev', type: 'divider' },
      { key: 'simulate-edit', label: 'Simulate edit by another user (dev)', icon: icon(Users) },
    )
  }
  return items
})

async function onMenu(key: string): Promise<void> {
  const value = canvas.data.value
  if (!value) return
  if (key === 'share') showShare.value = true
  if (key === 'rename') actions.startRename(value)
  if (key === 'duplicate') {
    // The copy is made on the server: save pending edits first so they're included.
    await store.flush()
    actions.startDuplicate(value)
  }
  if (key === 'delete') actions.confirmDelete(value)
  if (key === 'simulate-edit' && import.meta.env.VITE_API_MOCK === '1') {
    const { simulateRemoteEdit } = await import('@/mocks/devTools')
    const title = simulateRemoteEdit(value.id)
    message.info(
      title
        ? `k.lee moved “${title}” on the server. Edit it here to see a conflict, or refocus the tab to merge.`
        : 'Nothing to change: this canvas has no saved components yet.',
    )
  }
}

function back(): void {
  void router.push({ name: 'home' })
}
</script>

<template>
  <StatusPage
    v-if="notFound"
    :status="404"
    title="Canvas not found"
    description="It may have been deleted, or it hasn't been shared with you."
  />
  <DefaultLayout v-else>
    <template #top-left>
      <NButton quaternary circle aria-label="Back to canvases" @click="back">
        <template #icon>
          <NIcon><ArrowLeft /></NIcon>
        </template>
      </NButton>
      <template v-if="canvas.data.value">
        <h1 class="editor__title" data-testid="canvas-title">{{ canvas.data.value.title }}</h1>
        <NTag
          size="small"
          :bordered="false"
          :type="canvas.data.value.role === 'viewer' ? 'warning' : 'default'"
          data-testid="canvas-role"
        >
          {{
            canvas.data.value.role === 'viewer' ? 'View only' : roleLabel[canvas.data.value.role]
          }}
        </NTag>
        <NButton
          v-if="canvasCan.manageAccess(canvas.data.value.role)"
          size="small"
          secondary
          data-testid="share-button"
          @click="showShare = true"
        >
          <template #icon>
            <NIcon><Share2 /></NIcon>
          </template>
          Share
        </NButton>
        <NButton
          v-else-if="canvas.data.value.role === 'viewer'"
          size="small"
          secondary
          data-testid="duplicate-mine"
          @click="onMenu('duplicate')"
        >
          <template #icon>
            <NIcon><Copy /></NIcon>
          </template>
          Duplicate to my canvases
        </NButton>
        <template v-if="ready && store.canEdit">
          <div class="editor__history">
            <NTooltip>
              <template #trigger>
                <NButton
                  quaternary
                  circle
                  size="small"
                  aria-label="Undo"
                  data-testid="undo"
                  :disabled="!store.canUndo"
                  @click="store.undo()"
                >
                  <template #icon>
                    <NIcon><Undo2 /></NIcon>
                  </template>
                </NButton>
              </template>
              Undo (Ctrl/⌘ + Z)
            </NTooltip>
            <NTooltip>
              <template #trigger>
                <NButton
                  quaternary
                  circle
                  size="small"
                  aria-label="Redo"
                  data-testid="redo"
                  :disabled="!store.canRedo"
                  @click="store.redo()"
                >
                  <template #icon>
                    <NIcon><Redo2 /></NIcon>
                  </template>
                </NButton>
              </template>
              Redo (Ctrl/⌘ + Shift + Z)
            </NTooltip>
          </div>
          <SaveStatus
            :status="store.saveStatus"
            :error="store.rejection?.message"
            @open-conflict="showConflict = true"
            @retry="retrySave"
          />
        </template>
      </template>
    </template>
    <template #top-right>
      <NDropdown
        v-if="menu.length"
        trigger="click"
        placement="bottom-end"
        :options="menu"
        @select="onMenu"
      >
        <NButton quaternary circle aria-label="Canvas actions" data-testid="canvas-menu">
          <template #icon>
            <NIcon><Ellipsis /></NIcon>
          </template>
        </NButton>
      </NDropdown>
    </template>

    <div v-if="ready" class="editor-layout">
      <SidePanel
        v-if="store.canEdit"
        side="left"
        title="Components"
        storage-key="ui.panel.palette"
        :width="200"
      >
        <PalettePanel @add="(type) => canvasView?.addAtCenter(type)" />
      </SidePanel>
      <div class="editor-layout__canvas">
        <FilterBar @locate="(cid) => canvasView?.locate(cid)" />
        <div class="editor-layout__flow">
          <CanvasView ref="canvasView" :key="id" :canvas-id="id" />
        </div>
      </div>
      <SidePanel side="right" title="Inspector" storage-key="ui.panel.inspector" :width="280">
        <InspectorPanel />
      </SidePanel>
    </div>
    <div v-else class="editor">
      <NSpin v-if="canvas.isPending.value" />
      <NEmpty
        v-else-if="canvas.isError.value"
        :description="`Could not load the canvas: ${describeError(canvas.error.value)}`"
      >
        <template #extra>
          <NButton size="small" @click="canvas.refetch()">Retry</NButton>
        </template>
      </NEmpty>
    </div>

    <ShareDialog
      v-if="canvas.data.value"
      v-model:show="showShare"
      :canvas-id="id"
      :owner-id="canvas.data.value.owner.knoxId"
      :owner-name="canvas.data.value.owner.displayName"
    />
    <RestrictDialog
      v-if="restricting"
      v-model:show="showRestrict"
      :canvas-id="id"
      :component-id="restricting.id"
      :component-title="restricting.title"
    />
    <CanvasNameDialog
      v-model:show="actions.dialog.show"
      :mode="actions.dialog.mode"
      :initial-title="actions.dialog.initialTitle"
      :initial-description="actions.dialog.initialDescription"
      :loading="actions.dialog.loading"
      @submit="actions.submitDialog"
    />
    <ConflictDialog
      v-model:show="showConflict"
      :conflicts="store.conflicts"
      @resolve="store.resolveConflicts"
    />
  </DefaultLayout>
</template>

<style scoped>
.editor-layout {
  display: flex;
  height: 100%;
  min-height: 0;
}

.editor-layout__canvas {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.editor-layout__flow {
  position: relative;
  flex: 1;
  min-height: 0;
}

.editor {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 16px;
}

.editor__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  max-width: 32vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor__history {
  display: flex;
  margin-left: 4px;
}
</style>

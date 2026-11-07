<script setup lang="ts">
// Canvas editor: loads the canvas into the document store and renders the infinite canvas.
// F2: edits are local only; saving through ops arrives in F4.
import { computed, h, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NDropdown,
  NEmpty,
  NIcon,
  NSpin,
  NTag,
  NTooltip,
  type DropdownOption,
} from 'naive-ui'
import { ArrowLeft, Copy, Ellipsis, Pencil, Trash } from '@lucide/vue'
import { useCanvas } from '@/api/canvases'
import { ApiError } from '@/api/client'
import DefaultLayout from '@/app/layout/DefaultLayout.vue'
import CanvasView from '@/canvas/CanvasView.vue'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import CanvasNameDialog from '@/ui/canvases/CanvasNameDialog.vue'
import { canvasCan, roleLabel } from '@/ui/canvases/permissions'
import { useCanvasActions } from '@/ui/canvases/useCanvasActions'
import { describeError } from '@/ui/useApiErrorNotifier'
import StatusPage from './StatusPage.vue'

const props = defineProps<{ id: string }>()

const router = useRouter()
const canvas = useCanvas(() => props.id)
const actions = useCanvasActions({ onDeleted: () => void router.push({ name: 'home' }) })

const store = useCanvasDocStore()

// Load into the store when a canvas opens. Later refetches (e.g. after a rename) must not
// overwrite local edits, so only (re)load when the canvas id changes.
watch(
  () => canvas.data.value,
  (value) => {
    if (value && store.canvas?.id !== value.id) store.load(value)
  },
  { immediate: true },
)

const ready = computed(() => !!canvas.data.value && store.canvas?.id === props.id)

const notFound = computed(
  () => canvas.error.value instanceof ApiError && canvas.error.value.status === 404,
)

function icon(component: Component) {
  return () => h(NIcon, null, { default: () => h(component, { size: 16 }) })
}

const menu = computed<DropdownOption[]>(() => {
  const role = canvas.data.value?.role
  if (!role) return []
  const items: DropdownOption[] = []
  if (canvasCan.edit(role)) items.push({ key: 'rename', label: 'Rename', icon: icon(Pencil) })
  items.push({ key: 'duplicate', label: 'Duplicate', icon: icon(Copy) })
  if (canvasCan.delete(role)) items.push({ key: 'delete', label: 'Delete', icon: icon(Trash) })
  return items
})

function onMenu(key: string): void {
  const value = canvas.data.value
  if (!value) return
  if (key === 'rename') actions.startRename(value)
  if (key === 'duplicate') actions.startDuplicate(value)
  if (key === 'delete') actions.confirmDelete(value)
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
        <NTag size="small" :bordered="false">{{ roleLabel[canvas.data.value.role] }}</NTag>
        <NTooltip v-if="store.dirty">
          <template #trigger>
            <NTag size="small" type="warning" :bordered="false" data-testid="unsaved-tag">
              Not saved
            </NTag>
          </template>
          Layout changes are local to this tab for now. Saving arrives in roadmap milestone F4.
        </NTooltip>
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

    <CanvasView v-if="ready" :key="id" :canvas-id="id" />
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

    <CanvasNameDialog
      v-model:show="actions.dialog.show"
      :mode="actions.dialog.mode"
      :initial-title="actions.dialog.initialTitle"
      :initial-description="actions.dialog.initialDescription"
      :loading="actions.dialog.loading"
      @submit="actions.submitDialog"
    />
  </DefaultLayout>
</template>

<style scoped>
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
  max-width: 40vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

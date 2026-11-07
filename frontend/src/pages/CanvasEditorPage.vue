<script setup lang="ts">
// Canvas editor shell. The canvas itself (Vue Flow) arrives in roadmap F2; for now this
// loads the canvas, handles not-found, and offers the canvas-level actions.
import { computed, h, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NDropdown, NEmpty, NIcon, NSpin, NTag, type DropdownOption } from 'naive-ui'
import { ArrowLeft, Copy, Ellipsis, Pencil, Trash } from '@lucide/vue'
import { useCanvas } from '@/api/canvases'
import { ApiError } from '@/api/client'
import DefaultLayout from '@/app/layout/DefaultLayout.vue'
import CanvasNameDialog from '@/ui/canvases/CanvasNameDialog.vue'
import { canvasCan, roleLabel } from '@/ui/canvases/permissions'
import { useCanvasActions } from '@/ui/canvases/useCanvasActions'
import { formatRelativeTime, pluralize } from '@/ui/format'
import { describeError } from '@/ui/useApiErrorNotifier'
import StatusPage from './StatusPage.vue'

const props = defineProps<{ id: string }>()

const router = useRouter()
const canvas = useCanvas(() => props.id)
const actions = useCanvasActions({ onDeleted: () => void router.push({ name: 'home' }) })

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

    <div class="editor">
      <NSpin v-if="canvas.isPending.value" />
      <NEmpty
        v-else-if="canvas.isError.value"
        :description="`Could not load the canvas: ${describeError(canvas.error.value)}`"
      >
        <template #extra>
          <NButton size="small" @click="canvas.refetch()">Retry</NButton>
        </template>
      </NEmpty>
      <NEmpty
        v-else-if="canvas.data.value"
        description="The infinite canvas arrives in roadmap milestone F2."
        data-testid="editor-placeholder"
      >
        <template #extra>
          <p class="editor__meta">
            Owner {{ canvas.data.value.owner.displayName }} ·
            {{ pluralize(canvas.data.value.components.length, 'component') }} · edited
            {{ formatRelativeTime(canvas.data.value.updatedAt) }}
          </p>
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

.editor__meta {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 13px;
}
</style>

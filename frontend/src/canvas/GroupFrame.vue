<script setup lang="ts">
import FilterChips from '@/filters/FilterChips.vue'
import { computed, h, nextTick, ref, type Component } from 'vue'
import { NodeResizer, type OnResizeStart } from '@vue-flow/node-resizer'
import { NButton, NDropdown, NIcon, useMessage, type DropdownOption } from 'naive-ui'
import { ChevronDown, ChevronRight, Ellipsis, Pencil, Trash, Ungroup } from '@lucide/vue'
import { GROUP_HEADER, GROUP_MIN_SIZE, MAX_TITLE, useCanvasDocStore } from '@/stores/canvasDoc'
import { menuLabel } from '@/ui/menuLabel'
import { snapRect } from './geometry'
import { altPressed } from './modifiers'

defineOptions({ inheritAttrs: false })

/** Vue Flow node props (only the ones used here). */
const props = defineProps<{
  id: string
  selected: boolean
  data: { groupId: string }
}>()

const store = useCanvasDocStore()
const message = useMessage()

const group = computed(() => store.groups[props.data.groupId])
const childCount = computed(() => store.childrenOf(props.data.groupId).length)
const editable = computed(() => store.canEdit)

// Inline rename (double-click the title).
const renaming = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)

async function startRename(): Promise<void> {
  if (!editable.value || !group.value) return
  draft.value = group.value.title
  renaming.value = true
  await nextTick()
  input.value?.select()
}

function finishRename(commit: boolean): void {
  if (!renaming.value) return
  renaming.value = false
  if (commit) store.renameGroup(props.id, draft.value)
}

function toggleCollapsed(): void {
  if (group.value) store.setGroupCollapsed(props.id, !group.value.collapsed)
}

function onResizeEnd({ params }: OnResizeStart): void {
  const rect = snapRect(
    { x: params.x, y: params.y, w: params.width, h: params.height },
    !altPressed.value,
  )
  store.updateGroupGeometry(props.id, rect)
}

function icon(c: Component) {
  return () => h(NIcon, null, { default: () => h(c, { size: 16 }) })
}

const menu = computed<DropdownOption[]>(() => [
  { key: 'rename', label: menuLabel('Rename', { hint: 'F2' }), icon: icon(Pencil) },
  {
    key: 'collapse',
    label: menuLabel(group.value?.collapsed ? 'Expand' : 'Collapse'),
    icon: icon(group.value?.collapsed ? ChevronDown : ChevronRight),
  },
  { key: 'ungroup', label: menuLabel('Ungroup', { hint: 'Ctrl/⌘ Shift G' }), icon: icon(Ungroup) },
  { key: 'd1', type: 'divider' },
  {
    key: 'delete-all',
    label: menuLabel('Delete group and contents', { danger: true }),
    icon: icon(Trash),
  },
])

function onMenu(key: string): void {
  if (key === 'rename') void startRename()
  if (key === 'collapse') toggleCollapsed()
  if (key === 'ungroup') store.ungroup([props.id])
  if (key === 'delete-all') {
    const error = store.deleteGroupWithContents(props.id)
    if (error) message.error(error)
  }
}

defineExpose({ startRename })
</script>

<template>
  <!--
    Kept mounted with a header-height minimum: NodeResizer clamps the node to its minimum
    whenever it mounts or the minimum changes, which would fight collapse/expand. The real
    minimum (GROUP_MIN_SIZE) is enforced by the store when a resize ends.
  -->
  <NodeResizer
    v-if="editable && group"
    :is-visible="selected && !group.collapsed"
    :min-width="GROUP_MIN_SIZE.w"
    :min-height="GROUP_HEADER"
    color="var(--app-primary)"
    @resize-end="onResizeEnd"
  />
  <div
    v-if="group"
    class="group"
    :class="{ 'is-selected': selected, 'is-collapsed': group.collapsed }"
    :data-testid="`group-${group.id}`"
    :data-group-title="group.title"
  >
    <header class="group__header">
      <NButton
        quaternary
        circle
        size="tiny"
        class="nodrag"
        :aria-label="group.collapsed ? 'Expand group' : 'Collapse group'"
        :disabled="!editable"
        data-testid="group-collapse"
        @click.stop="toggleCollapsed"
      >
        <template #icon>
          <NIcon><component :is="group.collapsed ? ChevronRight : ChevronDown" /></NIcon>
        </template>
      </NButton>
      <input
        v-if="renaming"
        ref="input"
        v-model="draft"
        class="group__title-input nodrag"
        :maxlength="MAX_TITLE"
        aria-label="Group title"
        data-testid="group-title-input"
        @keydown.enter.prevent="finishRename(true)"
        @keydown.escape.prevent.stop="finishRename(false)"
        @blur="finishRename(true)"
      />
      <span
        v-else
        class="group__title"
        :title="group.title"
        data-testid="group-title"
        @dblclick.stop="startRename"
      >
        {{ group.title }}
      </span>
      <span class="group__count" data-testid="group-count">{{ childCount }}</span>
      <FilterChips v-if="!group.collapsed" :scope="group.id" compact class="group__filters" />
      <NDropdown
        v-if="editable"
        trigger="click"
        placement="bottom-end"
        :options="menu"
        @select="onMenu"
      >
        <NButton
          quaternary
          circle
          size="tiny"
          class="nodrag"
          aria-label="Group actions"
          data-testid="group-menu"
          @click.stop
        >
          <template #icon>
            <NIcon><Ellipsis /></NIcon>
          </template>
        </NButton>
      </NDropdown>
    </header>
  </div>
</template>

<style scoped>
.group {
  width: 100%;
  height: 100%;
  border: 1.5px dashed color-mix(in srgb, var(--app-primary) 45%, var(--app-border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-primary) 4%, transparent);
}

.group.is-selected {
  border-style: solid;
  border-color: var(--app-primary);
}

.group.is-collapsed {
  background: var(--app-panel-bg);
}

.group__header {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 6px;
  cursor: grab;
}

.group__title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.group__title-input {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  border: 1px solid var(--app-primary);
  border-radius: 4px;
  background: var(--app-panel-bg);
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
}

.group__count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
  color: var(--app-text-muted);
  font-size: 12px;
  text-align: center;
}
.group__filters {
  flex: 1;
  margin-left: 4px;
}
</style>

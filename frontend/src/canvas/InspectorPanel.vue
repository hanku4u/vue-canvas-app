<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NDivider, NIcon, NInput, NInputNumber, NSwitch } from 'naive-ui'
import { CircleQuestionMark, Group } from '@lucide/vue'
import { inspectorFields } from '@/registry/inspectorFields'
import { getDefinition, resolveConfig } from '@/registry/registry'
import type { ComponentConfig } from '@/registry/types'
import { MAX_TITLE, useCanvasDocStore } from '@/stores/canvasDoc'
import { useCanvasUiStore } from '@/stores/canvasUi'
import { pluralize } from '@/ui/format'
import SchemaForm from './SchemaForm.vue'

const store = useCanvasDocStore()
const ui = useCanvasUiStore()

const singleGroup = computed(() =>
  ui.selectedIds.length === 1 ? store.groups[ui.selectedIds[0] ?? ''] : undefined,
)
const groupTitle = ref('')
watch(
  () => singleGroup.value?.title,
  (value) => {
    groupTitle.value = value ?? ''
  },
  { immediate: true },
)
const groupError = ref<string | null>(null)

function commitGroupTitle(): void {
  const group = singleGroup.value
  if (group && !store.renameGroup(group.id, groupTitle.value)) groupTitle.value = group.title
}

function setGroupGeometry(field: 'x' | 'y' | 'w' | 'h', value: number | null): void {
  const group = singleGroup.value
  if (!group || value === null) return
  store.updateGroupGeometry(
    group.id,
    { [field]: Math.round(value) },
    { mergeKey: `inspector:${group.id}:${field}` },
  )
}

function deleteGroupWithContents(): void {
  if (singleGroup.value) groupError.value = store.deleteGroupWithContents(singleGroup.value.id)
}

const single = computed(() =>
  ui.selectedIds.length === 1 ? store.components[ui.selectedIds[0] ?? ''] : undefined,
)
const definition = computed(() => (single.value ? getDefinition(single.value.type) : undefined))
const editable = computed(() => !!single.value && !!store.editable(single.value.id))
const resolved = computed(() =>
  definition.value && single.value ? resolveConfig(definition.value, single.value) : null,
)
const fields = computed(() =>
  definition.value ? inspectorFields(definition.value.configSchema) : [],
)
const configError = ref<string | null>(null)

// Title: edited locally, committed on blur / Enter.
const title = ref('')
watch(
  () => single.value?.title,
  (value) => {
    title.value = value ?? ''
  },
  { immediate: true },
)
watch(
  () => ui.selectedIds.join(','),
  () => {
    configError.value = null
    groupError.value = null
  },
)

function commitTitle(): void {
  if (!single.value) return
  if (!store.renameComponent(single.value.id, title.value)) title.value = single.value.title
}

function setGeometry(field: 'x' | 'y' | 'w' | 'h', value: number | null): void {
  if (!single.value || value === null) return
  const min = definition.value?.minSize
  const clamped =
    field === 'w' && min
      ? Math.max(min.w, value)
      : field === 'h' && min
        ? Math.max(min.h, value)
        : value
  // Typing a number is one undo step per field, not one per keystroke.
  store.updateGeometry([{ id: single.value.id, [field]: Math.round(clamped) }], {
    mergeKey: `inspector:${single.value.id}:${field}`,
  })
}

function setConfig(key: string, value: unknown): void {
  if (!single.value) return
  configError.value = store.updateConfig(single.value.id, { [key]: value } as ComponentConfig)
}

function resetConfig(): void {
  if (!single.value || !definition.value) return
  configError.value = store.updateConfig(single.value.id, definition.value.defaultConfig(), {
    replace: true,
  })
}

const selectionEditable = computed(() => ui.selectedIds.some((id) => store.editable(id)))
</script>

<template>
  <div class="inspector" data-testid="inspector">
    <!-- One group -->
    <template v-if="singleGroup">
      <div class="inspector__type">
        <NIcon :size="16"><Group /></NIcon>
        <span>Group</span>
        <span v-if="!store.canEdit" class="inspector__readonly">view only</span>
      </div>

      <label class="inspector__label" for="inspector-group-title">Title</label>
      <NInput
        id="inspector-group-title"
        v-model:value="groupTitle"
        size="small"
        :maxlength="MAX_TITLE"
        :disabled="!store.canEdit"
        data-testid="inspector-group-title"
        @blur="commitGroupTitle"
        @keydown.enter="commitGroupTitle"
      />
      <label class="inspector__switch">
        <span>Collapsed</span>
        <NSwitch
          :value="singleGroup.collapsed"
          :disabled="!store.canEdit"
          data-testid="inspector-group-collapsed"
          @update:value="(v: boolean) => store.setGroupCollapsed(singleGroup!.id, v)"
        />
      </label>

      <NDivider title-placement="left" class="inspector__divider">Position &amp; size</NDivider>
      <div class="inspector__grid">
        <label
          >X<NInputNumber
            size="small"
            :value="singleGroup.x"
            :step="16"
            :disabled="!store.canEdit"
            :show-button="false"
            @update:value="(v) => setGroupGeometry('x', v)"
        /></label>
        <label
          >Y<NInputNumber
            size="small"
            :value="singleGroup.y"
            :step="16"
            :disabled="!store.canEdit"
            :show-button="false"
            @update:value="(v) => setGroupGeometry('y', v)"
        /></label>
        <label
          >W<NInputNumber
            size="small"
            :value="singleGroup.w"
            :step="16"
            :disabled="!store.canEdit"
            :show-button="false"
            @update:value="(v) => setGroupGeometry('w', v)"
        /></label>
        <label
          >H<NInputNumber
            size="small"
            :value="singleGroup.h"
            :step="16"
            :disabled="!store.canEdit"
            :show-button="false"
            @update:value="(v) => setGroupGeometry('h', v)"
        /></label>
      </div>

      <NDivider title-placement="left" class="inspector__divider">Contents</NDivider>
      <p class="inspector__hint" data-testid="inspector-group-contents">
        {{ pluralize(store.childrenOf(singleGroup.id).length, 'component') }}. Drag components onto
        the frame to add them, or out of it to remove them.
      </p>
      <div v-if="store.canEdit" class="inspector__actions">
        <NButton
          size="small"
          data-testid="inspector-ungroup"
          @click="store.ungroup([singleGroup.id])"
        >
          Ungroup
        </NButton>
        <NButton
          size="small"
          type="error"
          secondary
          data-testid="inspector-delete-group"
          @click="deleteGroupWithContents"
        >
          Delete with contents
        </NButton>
      </div>
      <NAlert v-if="groupError" type="error" :show-icon="false" class="inspector__alert">
        {{ groupError }}
      </NAlert>
    </template>

    <!-- One component -->
    <template v-else-if="single">
      <div class="inspector__type">
        <NIcon :size="16"><component :is="definition?.icon ?? CircleQuestionMark" /></NIcon>
        <span>{{ definition?.label ?? single.type }}</span>
        <span v-if="!editable" class="inspector__readonly">view only</span>
      </div>

      <label class="inspector__label" for="inspector-title">Title</label>
      <NInput
        id="inspector-title"
        v-model:value="title"
        size="small"
        :maxlength="MAX_TITLE"
        :disabled="!editable"
        data-testid="inspector-title"
        @blur="commitTitle"
        @keydown.enter="commitTitle"
      />

      <NDivider title-placement="left" class="inspector__divider">Position &amp; size</NDivider>
      <div class="inspector__grid">
        <label
          >X<NInputNumber
            size="small"
            :value="single.x"
            :step="16"
            :disabled="!editable"
            :show-button="false"
            @update:value="(v) => setGeometry('x', v)"
        /></label>
        <label
          >Y<NInputNumber
            size="small"
            :value="single.y"
            :step="16"
            :disabled="!editable"
            :show-button="false"
            @update:value="(v) => setGeometry('y', v)"
        /></label>
        <label
          >W<NInputNumber
            size="small"
            :value="single.w"
            :step="16"
            :disabled="!editable"
            :show-button="false"
            @update:value="(v) => setGeometry('w', v)"
        /></label>
        <label
          >H<NInputNumber
            size="small"
            :value="single.h"
            :step="16"
            :disabled="!editable"
            :show-button="false"
            @update:value="(v) => setGeometry('h', v)"
        /></label>
      </div>

      <template v-if="resolved && (fields.length || definition?.inspector)">
        <NDivider title-placement="left" class="inspector__divider">Settings</NDivider>
        <NAlert v-if="!resolved.ok" type="warning" :show-icon="false" class="inspector__alert">
          Saved settings are invalid ({{ resolved.error }}). Showing defaults.
          <NButton v-if="editable" size="tiny" @click="resetConfig">Reset to defaults</NButton>
        </NAlert>
        <SchemaForm
          :fields="fields"
          :config="resolved.config"
          :disabled="!editable"
          @change="setConfig"
        />
        <component
          :is="definition.inspector"
          v-if="definition?.inspector"
          :component="single"
          :config="resolved.config"
          :editable="editable"
          :active="false"
          @update-config="
            (patch: ComponentConfig) => (configError = store.updateConfig(single!.id, patch))
          "
        />
        <NAlert v-if="configError" type="error" :show-icon="false" class="inspector__alert">
          {{ configError }}
        </NAlert>
      </template>
    </template>

    <!-- Several components -->
    <template v-else-if="ui.selectedIds.length > 1">
      <p class="inspector__summary" data-testid="inspector-multi">
        {{ pluralize(ui.selectedIds.length, 'component') }} selected
      </p>
      <div v-if="selectionEditable" class="inspector__actions">
        <NButton size="small" @click="store.bringToFront(ui.selectedIds)">Bring to front</NButton>
        <NButton size="small" @click="store.sendToBack(ui.selectedIds)">Send to back</NButton>
        <NButton size="small" @click="store.duplicateComponents(ui.selectedIds)">Duplicate</NButton>
        <NButton
          size="small"
          type="error"
          secondary
          @click="store.removeComponents(ui.selectedIds)"
        >
          Delete
        </NButton>
      </div>
    </template>

    <!-- Nothing selected -->
    <template v-else>
      <p class="inspector__summary">Select a component to see its settings.</p>
      <p v-if="store.canvas" class="inspector__hint">
        {{ pluralize(store.ordered.length, 'component') }} on this canvas.
      </p>
    </template>
  </div>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.inspector__type {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.inspector__readonly {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--app-text-muted);
}

.inspector__label {
  font-size: 12px;
  color: var(--app-text-muted);
}

.inspector__divider {
  margin: 8px 0 4px !important;
  font-size: 12px !important;
  color: var(--app-text-muted);
}

.inspector__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
}

.inspector__grid label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.inspector__alert {
  font-size: 12px;
}

.inspector__summary {
  margin: 0;
}

.inspector__hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-muted);
}

.inspector__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.inspector__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>

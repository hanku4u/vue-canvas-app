<script setup lang="ts">
import { computed, h } from 'vue'
import { NAlert, NSelect, NSkeleton, type SelectGroupOption, type SelectOption } from 'naive-ui'
import type { CanvasComponent, ComponentKind } from '@/api/types'
import { useDatasets } from '@/data/query'
import ParamField from './ParamField.vue'

/** Dataset picker and parameter form for data components (docs/canvas-ux.md, Inspector). */
const props = defineProps<{
  component: CanvasComponent
  dataKind: ComponentKind
  dataset: string
  params: Record<string, unknown>
  editable: boolean
}>()
const emit = defineEmits<{
  change: [patch: { dataset?: string; params: Record<string, unknown> }]
}>()

const datasets = useDatasets()
const current = computed(() => datasets.data.value?.find((d) => d.id === props.dataset))

const options = computed<SelectGroupOption[]>(() => {
  const suitable = (datasets.data.value ?? []).filter((d) => d.suits.includes(props.dataKind))
  const categories = [...new Set(suitable.map((d) => d.category))]
  return categories.map((category) => ({
    type: 'group',
    label: category,
    key: category,
    children: suitable
      .filter((d) => d.category === category)
      .map((d) => ({ label: d.label, value: d.id, description: d.description })),
  }))
})

function renderOption({ node, option }: { node: ReturnType<typeof h>; option: SelectOption }) {
  if (!option.description) return node
  return h('div', { title: String(option.description) }, [node])
}

function setDataset(id: string | null): void {
  // Params belong to a dataset: start fresh (defaults apply) when it changes.
  emit('change', { dataset: id ?? '', params: {} })
}

function setParam(name: string, value: unknown): void {
  const params = { ...props.params }
  if (value === undefined) delete params[name]
  else params[name] = value
  emit('change', { params })
}
</script>

<template>
  <div class="data-source" data-testid="data-source">
    <label class="data-source__label">Dataset</label>
    <NSkeleton v-if="datasets.isPending.value" height="28px" />
    <NAlert v-else-if="datasets.isError.value" type="error" :show-icon="false">
      Could not load datasets.
    </NAlert>
    <NSelect
      v-else
      size="small"
      filterable
      :value="dataset || null"
      :options="options"
      :render-option="renderOption"
      placeholder="Choose a dataset"
      :disabled="!editable"
      data-testid="dataset-select"
      @update:value="setDataset"
    />
    <p v-if="current" class="data-source__description">{{ current.description }}</p>

    <ParamField
      v-for="param in current?.params ?? []"
      :key="`${current!.id}:${param.name}`"
      :dataset-id="current!.id"
      :param="param"
      :value="params[param.name]"
      :disabled="!editable"
      @change="(v) => setParam(param.name, v)"
    />
  </div>
</template>

<style scoped>
.data-source {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-source__label {
  font-size: 12px;
  color: var(--app-text-muted);
}

.data-source__description {
  margin: -2px 0 0;
  font-size: 12px;
  color: var(--app-text-muted);
}
</style>

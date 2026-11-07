<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NCheckbox, NSelect, type SelectOption } from 'naive-ui'
import { useDatasets } from '@/data/query'
import type { ComponentViewProps } from '@/registry/types'
import { orderedColumns } from './grid'
import type { PublishRule, TableConfig } from './schema'

/** Extra inspector section for tables: visible columns and selection publishing. */
const props = defineProps<ComponentViewProps<TableConfig>>()
const emit = defineEmits<{ 'update-config': [patch: Partial<TableConfig>] }>()

const datasets = useDatasets()
const dataset = computed(() => datasets.data.value?.find((d) => d.id === props.config.dataset))
const layout = computed(() => orderedColumns(dataset.value?.columns ?? [], props.config.columns))
const labelOf = (name: string) => dataset.value?.columns.find((c) => c.name === name)?.label ?? name

function toggle(name: string, visible: boolean): void {
  emit('update-config', {
    columns: layout.value.map((c) => (c.name === name ? { ...c, visible } : c)),
  })
}

function showAll(): void {
  emit('update-config', { columns: layout.value.map((c) => ({ ...c, visible: true })) })
}

// Selection publishing (wired to filters in F10). Dimensions: the dataset's filterable
// params plus the common fab dimensions.
const DIMENSIONS = ['lot_id', 'wafer_id', 'tool_id', 'chamber', 'product', 'parameter']
const columnOptions = computed<SelectOption[]>(() =>
  (dataset.value?.columns ?? []).map((c) => ({ label: c.label ?? c.name, value: c.name })),
)
const dimensionOptions = computed<SelectOption[]>(() => {
  const fromParams = (dataset.value?.params ?? [])
    .map((p) => p.filter?.split('.')[0])
    .filter((d): d is string => !!d && d !== 'time_range')
  return [...new Set([...DIMENSIONS, ...fromParams])].map((d) => ({ label: d, value: d }))
})

function setRule(index: number, patch: Partial<PublishRule>): void {
  emit('update-config', {
    publish: props.config.publish.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
  })
}

function addRule(): void {
  const lot = dataset.value?.columns.find((c) => DIMENSIONS.includes(c.name))
  const column = lot?.name ?? dataset.value?.columns[0]?.name ?? ''
  emit('update-config', {
    publish: [
      ...props.config.publish,
      { column, dimension: DIMENSIONS.includes(column) ? column : 'lot_id' },
    ],
  })
}

function removeRule(index: number): void {
  emit('update-config', { publish: props.config.publish.filter((_, i) => i !== index) })
}
</script>

<template>
  <div v-if="dataset" class="table-inspector" data-testid="table-inspector">
    <div class="table-inspector__head">
      <span>Columns</span>
      <NButton text size="tiny" :disabled="!editable" @click="showAll">Show all</NButton>
    </div>
    <div class="table-inspector__columns">
      <NCheckbox
        v-for="column in layout"
        :key="column.name"
        :checked="column.visible"
        :disabled="!editable"
        :data-column="column.name"
        @update:checked="(v: boolean) => toggle(column.name, v)"
      >
        {{ labelOf(column.name) }}
      </NCheckbox>
    </div>
    <p class="table-inspector__hint">Drag headers in the table to reorder, resize or pin.</p>

    <div class="table-inspector__head">
      <span>Selected rows set filters</span>
      <NButton text size="tiny" :disabled="!editable" data-testid="add-publish" @click="addRule">
        Add
      </NButton>
    </div>
    <div v-for="(rule, index) in config.publish" :key="index" class="table-inspector__rule">
      <NSelect
        size="small"
        :value="rule.column"
        :options="columnOptions"
        :disabled="!editable"
        @update:value="(v: string) => setRule(index, { column: v })"
      />
      <span>→</span>
      <NSelect
        size="small"
        :value="rule.dimension"
        :options="dimensionOptions"
        :disabled="!editable"
        @update:value="(v: string) => setRule(index, { dimension: v })"
      />
      <NButton text size="tiny" :disabled="!editable" @click="removeRule(index)">✕</NButton>
    </div>
    <p v-if="!config.publish.length" class="table-inspector__hint">
      E.g. selecting lots sets the <code>lot_id</code> filter for this table's group.
    </p>
  </div>
</template>

<style scoped>
.table-inspector {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.table-inspector__head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--app-text-muted);
}

.table-inspector__columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 8px;
  max-height: 180px;
  overflow: auto;
  font-size: 12px;
}

.table-inspector__hint {
  margin: 0;
  font-size: 11px;
  color: var(--app-text-muted);
}

.table-inspector__rule {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  align-items: center;
  gap: 4px;
}
</style>

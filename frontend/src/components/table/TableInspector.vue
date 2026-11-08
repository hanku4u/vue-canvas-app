<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NCheckbox } from 'naive-ui'
import { useDatasets } from '@/data/query'
import type { ComponentViewProps } from '@/registry/types'
import { orderedColumns } from './columns'
import PublishRules from '../shared/PublishRules.vue'
import type { TableConfig } from './schema'

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

    <PublishRules
      :dataset="dataset"
      :rules="config.publish"
      :editable="editable"
      title="Selected rows set filters"
      hint="E.g. selecting lots sets the Lot filter for this table's group (or the canvas)."
      @change="(publish) => emit('update-config', { publish })"
    />
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
</style>

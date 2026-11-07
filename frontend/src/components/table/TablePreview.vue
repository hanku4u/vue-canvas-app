<script setup lang="ts">
import { computed } from 'vue'
import { useDatasets } from '@/data/query'
import type { ComponentViewProps } from '@/registry/types'
import { useComponentDataStore } from '@/stores/componentData'
import type { TableConfig } from './schema'

/** Zoomed-out view: what the table shows, without mounting the grid. */
const props = defineProps<ComponentViewProps<TableConfig>>()
const datasets = useDatasets()
const dataStore = useComponentDataStore()

const dataset = computed(() => datasets.data.value?.find((d) => d.id === props.config.dataset))
const total = computed(() => dataStore.byId.get(props.component.id)?.meta?.totalRows)
const headers = computed(() =>
  (dataset.value?.columns ?? []).slice(0, 6).map((c) => c.label ?? c.name),
)
</script>

<template>
  <div class="table-preview" data-testid="table-preview">
    <div class="table-preview__head">
      <span v-for="h in headers" :key="h">{{ h }}</span>
    </div>
    <div class="table-preview__rows">
      <div v-for="n in 6" :key="n" class="table-preview__row" />
    </div>
    <div class="table-preview__caption">
      {{ dataset?.label ?? 'Table'
      }}<template v-if="total !== undefined"> · {{ total.toLocaleString() }} rows</template>
    </div>
  </div>
</template>

<style scoped>
.table-preview {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.table-preview__head {
  display: flex;
  gap: 16px;
  padding: 6px 10px;
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
}

.table-preview__row {
  height: 28px;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 60%, transparent);
}

.table-preview__caption {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 26px;
  font-weight: 600;
  color: var(--app-text-muted);
}
</style>

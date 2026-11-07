<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentViewProps } from '@/registry/types'
import { useComponentDataStore } from '@/stores/componentData'
import type { ChartConfig } from './schema'

/** Zoomed-out view: the last rendered image of the chart (captured after each render). */
const props = defineProps<ComponentViewProps<ChartConfig>>()
const dataStore = useComponentDataStore()
const snapshot = computed(() => dataStore.snapshots.get(props.component.id))

const KIND_LABELS: Record<ChartConfig['kind'], string> = {
  line: 'Trend',
  scatter: 'Scatter',
  histogram: 'Histogram',
  boxplot: 'Box plot',
  spc: 'SPC chart',
}
</script>

<template>
  <div class="chart-preview" data-testid="chart-preview">
    <img v-if="snapshot" :src="snapshot" alt="" class="chart-preview__image" draggable="false" />
    <span v-else class="chart-preview__label">{{ KIND_LABELS[config.kind] }}</span>
  </div>
</template>

<style scoped>
.chart-preview {
  display: grid;
  place-items: center;
  height: 100%;
  overflow: hidden;
}

.chart-preview__image {
  width: 100%;
  height: 100%;
  object-fit: fill;
}

.chart-preview__label {
  font-size: 26px;
  font-weight: 600;
  color: var(--app-text-muted);
}
</style>

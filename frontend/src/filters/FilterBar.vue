<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NTooltip } from 'naive-ui'
import type { FilterSet } from '@/api/types'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { useCanvasUiStore } from '@/stores/canvasUi'
import { useFiltersStore } from '@/stores/filters'
import FilterChips from './FilterChips.vue'

/** Canvas-level filters under the top bar (docs/canvas-ux.md#filters). */
const emit = defineEmits<{ locate: [componentId: string] }>()

const doc = useCanvasDocStore()
const ui = useCanvasUiStore()
const filters = useFiltersStore()

const sessionValues = computed(() => Object.entries(filters.session.canvas))
const ownValues = computed(() => sessionValues.value.filter(([, e]) => !e.source))
const hasSession = computed(() => sessionValues.value.length > 0)

/** Editors: store the current (non-published) session filters as the canvas defaults. */
function saveAsDefault(): void {
  const next: FilterSet = { ...doc.canvas?.defaultFilters }
  for (const [dimension, entry] of ownValues.value) next[dimension] = entry.value
  doc.setCanvasDefaultFilters(next)
  for (const [dimension] of ownValues.value) filters.setFilter('canvas', dimension, null)
}

/** Back to the saved defaults: drop session filters and clear selections that published. */
function reset(): void {
  for (const [, entry] of sessionValues.value) {
    if (entry.source) ui.setRowSelection(entry.source, [])
  }
  filters.clearScope('canvas')
}
</script>

<template>
  <div class="filter-bar" data-testid="filter-bar">
    <span class="filter-bar__title">Filters</span>
    <FilterChips scope="canvas" @locate="(id) => emit('locate', id)" />
    <div class="filter-bar__actions">
      <NTooltip v-if="doc.canEdit && ownValues.length">
        <template #trigger>
          <NButton size="tiny" quaternary data-testid="save-filters" @click="saveAsDefault">
            Save as default
          </NButton>
        </template>
        Make these filters the canvas defaults for everyone.
      </NTooltip>
      <NButton v-if="hasSession" size="tiny" quaternary data-testid="reset-filters" @click="reset">
        Reset
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 4px 12px;
  background: var(--app-panel-bg);
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.filter-bar__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filter-bar__actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
</style>

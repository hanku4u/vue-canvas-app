<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NDropdown, NIcon, NPopover, NTooltip, type DropdownOption } from 'naive-ui'
import { Plus } from '@lucide/vue'
import type { FilterDimension, FilterValue } from '@/api/types'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { useCanvasUiStore } from '@/stores/canvasUi'
import { useFiltersStore, type FilterScope } from '@/stores/filters'
import { useFilterDimensions } from './dimensions'
import FilterValueEditor from './FilterValueEditor.vue'
import { describeFilter, isEmptyFilter } from './values'

/**
 * Filter chips for one scope (the canvas filter bar, or a group header): session values,
 * values published by components ("from …"), and saved defaults. Click a chip to edit;
 * "+" adds a filter. Anyone (viewers too) can change session filters.
 */
const props = defineProps<{ scope: FilterScope; compact?: boolean }>()
const emit = defineEmits<{ locate: [componentId: string] }>()

const doc = useCanvasDocStore()
const ui = useCanvasUiStore()
const filters = useFiltersStore()
const dimensions = useFilterDimensions()

interface Chip {
  dimension: FilterDimension
  value: FilterValue
  kind: 'session' | 'published' | 'default' | 'dimension'
  source?: string
}

const defaults = computed(() =>
  props.scope === 'canvas'
    ? (doc.canvas?.defaultFilters ?? {})
    : (doc.groups[props.scope]?.defaultFilters ?? {}),
)

const chips = computed<Chip[]>(() => {
  const session = filters.peek(props.scope)
  const out: Chip[] = []
  for (const dimension of dimensions.data.value ?? []) {
    const entry = session[dimension.id]
    if (entry && !isEmptyFilter(entry.value)) {
      out.push({
        dimension,
        value: entry.value,
        kind: entry.source ? 'published' : 'session',
        source: entry.source,
      })
    } else if (defaults.value[dimension.id] && !isEmptyFilter(defaults.value[dimension.id])) {
      out.push({ dimension, value: defaults.value[dimension.id]!, kind: 'default' })
    } else if (props.scope === 'canvas' && dimension.default && !isEmptyFilter(dimension.default)) {
      out.push({ dimension, value: dimension.default, kind: 'dimension' })
    }
  }
  return out
})

const addable = computed<DropdownOption[]>(() =>
  (dimensions.data.value ?? [])
    .filter((d) => !chips.value.some((c) => c.dimension.id === d.id))
    .map((d) => ({ key: d.id, label: d.label })),
)

const open = ref<string | null>(null)
const adding = ref<FilterDimension | null>(null)

function setValue(dimension: string, value: FilterValue | null): void {
  filters.setFilter(props.scope, dimension, value)
}

function remove(chip: Chip): void {
  // A published value is withdrawn by clearing the publisher's selection.
  if (chip.kind === 'published' && chip.source) ui.setRowSelection(chip.source, [])
  else setValue(chip.dimension.id, null)
}

function startAdding(id: string): void {
  adding.value = dimensions.data.value?.find((d) => d.id === id) ?? null
  open.value = `add:${id}`
}

function sourceTitle(id?: string): string {
  return (id && doc.components[id]?.title) || 'a component'
}

function chipTitle(chip: Chip): string {
  if (chip.kind === 'published') return `Selected in “${sourceTitle(chip.source)}”`
  if (chip.kind === 'default') return 'Saved default'
  if (chip.kind === 'dimension') return 'Default for everyone'
  return props.scope === 'canvas' ? 'Set for this session' : 'Set for this group (session)'
}
</script>

<template>
  <div
    class="chips"
    :class="{ 'is-compact': compact }"
    :data-scope="scope"
    data-testid="filter-chips"
  >
    <NPopover
      v-for="chip in chips"
      :key="chip.dimension.id"
      trigger="manual"
      placement="bottom-start"
      :show="open === chip.dimension.id"
      :on-clickoutside="() => (open = null)"
    >
      <template #trigger>
        <span
          class="chip nodrag"
          :class="`chip--${chip.kind}`"
          :data-dimension="chip.dimension.id"
          data-testid="filter-chip"
        >
          <NTooltip>
            <template #trigger>
              <button
                type="button"
                class="chip__body"
                @click.stop="open = open === chip.dimension.id ? null : chip.dimension.id"
                @dblclick.stop="chip.source && emit('locate', chip.source)"
                @mouseenter="ui.highlightId = chip.source ?? null"
                @mouseleave="ui.highlightId = null"
              >
                <span class="chip__label">{{ chip.dimension.label }}:</span>
                <span class="chip__value">{{ describeFilter(chip.value) }}</span>
                <span v-if="chip.kind === 'published'" class="chip__from">
                  · {{ sourceTitle(chip.source) }}
                </span>
              </button>
            </template>
            {{ chipTitle(chip)
            }}<template v-if="chip.kind === 'published'"> — double-click to show it</template>
          </NTooltip>
          <button
            v-if="chip.kind === 'session' || chip.kind === 'published'"
            type="button"
            class="chip__remove"
            :aria-label="`Remove ${chip.dimension.label} filter`"
            data-testid="filter-chip-remove"
            @click.stop="remove(chip)"
          >
            ×
          </button>
        </span>
      </template>
      <FilterValueEditor
        :dimension="chip.dimension"
        :value="chip.value"
        autofocus
        @change="(v) => setValue(chip.dimension.id, v)"
      />
    </NPopover>

    <NPopover
      v-if="adding"
      trigger="manual"
      placement="bottom-start"
      :show="open === `add:${adding.id}`"
      :on-clickoutside="() => ((open = null), (adding = null))"
    >
      <template #trigger>
        <span class="chip chip--session nodrag">
          <span class="chip__body"
            ><span class="chip__label">{{ adding.label }}:</span> …</span
          >
        </span>
      </template>
      <FilterValueEditor
        :dimension="adding"
        :value="null"
        autofocus
        @change="(v) => (setValue(adding!.id, v), (open = adding!.id), (adding = null))"
      />
    </NPopover>

    <NDropdown
      v-if="addable.length"
      trigger="click"
      :options="addable"
      placement="bottom-start"
      @select="startAdding"
    >
      <NButton
        size="tiny"
        :quaternary="compact"
        :secondary="!compact"
        class="nodrag"
        data-testid="add-filter"
        @click.stop
      >
        <template #icon>
          <NIcon aria-hidden="true"><Plus /></NIcon>
        </template>
        <template v-if="!compact">Filter</template>
      </NButton>
    </NDropdown>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.chips.is-compact {
  flex-wrap: nowrap;
  overflow: hidden;
}

.chip {
  display: inline-flex;
  align-items: center;
  max-width: 320px;
  border-radius: 12px;
  border: 1px solid var(--app-border);
  background: var(--app-panel-bg);
  font-size: 12px;
  white-space: nowrap;
}

.chip--session {
  border-color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 8%, var(--app-panel-bg));
}

.chip--published {
  border-color: var(--app-primary);
  border-style: dashed;
}

.chip--default,
.chip--dimension {
  color: var(--app-text-muted);
}

.chip__body {
  display: inline-flex;
  gap: 4px;
  min-width: 0;
  padding: 1px 4px 1px 10px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.chip__label {
  font-weight: 600;
}

.chip__value,
.chip__from {
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip__from {
  color: var(--app-text-muted);
}

.chip__remove {
  padding: 0 8px 0 4px;
  border: 0;
  background: none;
  color: var(--app-text-muted);
  font-size: 14px;
  cursor: pointer;
}

.chip__body:last-child {
  padding-right: 10px;
}
</style>

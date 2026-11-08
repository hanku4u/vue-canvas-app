<script setup lang="ts">
import { computed, h } from 'vue'
import {
  NAlert,
  NButton,
  NSelect,
  NSkeleton,
  type SelectGroupOption,
  type SelectOption,
} from 'naive-ui'
import type { CanvasComponent, ComponentKind } from '@/api/types'
import { useDatasets } from '@/data/query'
import { bindableDimension, isBound } from '@/filters/bindings'
import { useFilterDimensions } from '@/filters/dimensions'
import { levelLabel } from '@/filters/resolve'
import { useResolvedFilters } from '@/filters/useResolvedFilters'
import { describeFilter } from '@/filters/values'
import ParamField from './ParamField.vue'

/** Dataset picker and parameter form for data components (docs/canvas-ux.md, Inspector). */
const props = defineProps<{
  component: CanvasComponent
  dataKind: ComponentKind
  dataset: string
  params: Record<string, unknown>
  bindings: Record<string, boolean>
  editable: boolean
}>()
const emit = defineEmits<{
  change: [
    patch: {
      dataset?: string
      params?: Record<string, unknown>
      bindings?: Record<string, boolean>
    },
  ]
}>()

// Bindings: params with a `filter` hint follow that filter unless unlinked here.
const dimensions = useFilterDimensions()
const filters = useResolvedFilters({ componentId: () => props.component.id })

interface ParamBinding {
  dimension: string
  label: string
  bound: boolean
  /** A canvas/group filter sets this param (the field is read-only). */
  locked: boolean
  /** Filter value applying right now (when bound). */
  value: string | null
  from: string
}

function bindingOf(name: string, filterHint: string | null): ParamBinding | null {
  const dimension = bindableDimension(filterHint)
  if (!dimension) return null
  const bound = isBound(name, props.bindings)
  const candidate = bound ? filters.value[dimension] : undefined
  const own = props.params[name]
  const filter =
    candidate?.level === 'dimension' && own !== undefined && own !== null && own !== ''
      ? undefined
      : candidate
  return {
    dimension,
    label: dimensions.data.value?.find((d) => d.id === dimension)?.label ?? dimension,
    bound,
    locked: !!filter && filter.level !== 'dimension',
    value: filter ? describeFilter(filter.value) : null,
    from: filter ? levelLabel(filter.level) : '',
  }
}

function setBound(name: string, bound: boolean): void {
  const bindings = { ...props.bindings }
  if (bound) delete bindings[name]
  else bindings[name] = false
  emit('change', { bindings })
}

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
      :input-props="{ 'aria-label': 'Dataset' }"
      :disabled="!editable"
      data-testid="dataset-select"
      @update:value="setDataset"
    />
    <p v-if="current" class="data-source__description">{{ current.description }}</p>

    <div
      v-for="param in current?.params ?? []"
      :key="`${current!.id}:${param.name}`"
      class="data-source__param"
    >
      <ParamField
        :dataset-id="current!.id"
        :param="param"
        :value="bindingOf(param.name, param.filter)?.locked ? undefined : params[param.name]"
        :filter-value="
          bindingOf(param.name, param.filter)?.locked
            ? bindingOf(param.name, param.filter)!.value
            : null
        "
        :disabled="!editable || !!bindingOf(param.name, param.filter)?.locked"
        @change="(v) => setParam(param.name, v)"
      />
      <div
        v-if="bindingOf(param.name, param.filter)"
        class="data-source__binding"
        :data-binding="param.name"
        data-testid="param-binding"
      >
        <template v-if="bindingOf(param.name, param.filter)!.bound">
          <span v-if="bindingOf(param.name, param.filter)!.value">
            Follows the {{ bindingOf(param.name, param.filter)!.label }} filter:
            <strong>{{ bindingOf(param.name, param.filter)!.value }}</strong>
            ({{ bindingOf(param.name, param.filter)!.from }})
          </span>
          <span v-else>
            Follows the {{ bindingOf(param.name, param.filter)!.label }} filter when one is set
          </span>
          <NButton
            text
            size="tiny"
            :disabled="!editable"
            data-testid="unlink-param"
            @click="setBound(param.name, false)"
          >
            Unlink
          </NButton>
        </template>
        <template v-else>
          <span>Ignores the {{ bindingOf(param.name, param.filter)!.label }} filter</span>
          <NButton
            text
            size="tiny"
            :disabled="!editable"
            data-testid="link-param"
            @click="setBound(param.name, true)"
          >
            Link
          </NButton>
        </template>
      </div>
    </div>
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

.data-source__binding {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--app-text-muted);
}

.data-source__description {
  margin: -2px 0 0;
  font-size: 12px;
  color: var(--app-text-muted);
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NDatePicker,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NTooltip,
  type SelectOption,
} from 'naive-ui'
import type { DatasetParam } from '@/api/types'
import { describeTime, isRelativeTime, RELATIVE_TIME_PRESETS } from '@/data/params'
import { useParamValues } from '@/data/query'

/** One dataset parameter in the inspector, with a widget for its type. */
const props = defineProps<{
  datasetId: string
  param: DatasetParam
  value: unknown
  disabled?: boolean
  /** Shown instead of the default when a filter sets this param (field read-only). */
  filterValue?: string | null
}>()
const emit = defineEmits<{ change: [value: unknown] }>()

const search = ref('')
const hasRemoteValues = computed(() => !!props.param.valuesFrom)
const values = useParamValues(
  () => props.datasetId,
  () => props.param.name,
  search,
  hasRemoteValues,
)

function toOptions(list: string[]): SelectOption[] {
  return list.map((v) => ({ label: v, value: v }))
}

const options = computed<SelectOption[]>(() => {
  if (props.param.values) return toOptions(props.param.values)
  // While a new search loads, the previous results are still shown: narrow them to the
  // search here so Enter never picks a stale, non-matching value.
  const term = search.value.toLowerCase()
  const remote = (values.data.value?.values ?? []).filter(
    (v) => !term || v.toLowerCase().includes(term),
  )
  // Keep selected values visible even when the search hides them.
  const selected = Array.isArray(props.value)
    ? props.value.map(String)
    : props.value
      ? [String(props.value)]
      : []
  // Naive UI drops the "use what I typed" tag option in remote mode; add it back so a value
  // that isn't (yet) suggested can still be entered.
  const typed = hasRemoteValues.value && search.value.trim() ? [search.value.trim()] : []
  return toOptions([...new Set([...selected, ...remote, ...typed])])
})

const placeholder = computed(() => {
  if (props.filterValue) return `Filter: ${props.filterValue}`
  const d = props.param.default
  if (d === undefined || d === null || d === '') return props.param.required ? 'Required' : 'Any'
  if (props.param.type === 'datetime' || props.param.type === 'date') {
    return `Default: ${describeTime(d).toLowerCase()}`
  }
  return `Default: ${Array.isArray(d) ? d.join(', ') : String(d)}`
})

// Datetimes: a relative preset or an absolute "custom" time.
const timeMode = computed(() =>
  props.value === undefined ||
  props.value === null ||
  props.value === '' ||
  isRelativeTime(props.value)
    ? 'relative'
    : 'absolute',
)
const timeOptions = computed<SelectOption[]>(() => [
  ...RELATIVE_TIME_PRESETS.map((p) => ({ label: p.label, value: p.value })),
  { label: 'Custom date and time…', value: '__custom' },
])

function onTimePreset(value: string | null): void {
  if (value === '__custom')
    emit('change', new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString())
  else emit('change', value ?? undefined)
}

const timestamp = computed(() => (typeof props.value === 'string' ? Date.parse(props.value) : null))
</script>

<template>
  <div class="param-field" :data-param="param.name">
    <div class="param-field__label">
      <span>{{ param.label ?? param.name }}</span>
      <span v-if="param.required" class="param-field__required" aria-label="required">*</span>
      <NTooltip v-if="param.filter">
        <template #trigger>
          <span class="param-field__bind">⇄ {{ param.filter.split('.')[0] }}</span>
        </template>
        Can follow the canvas or group “{{ param.filter.split('.')[0] }}” filter (filters arrive in
        F10).
      </NTooltip>
    </div>

    <template v-if="param.type === 'datetime' || param.type === 'date'">
      <NSelect
        :input-props="{ 'aria-label': param.label ?? param.name }"
        size="small"
        :value="timeMode === 'relative' ? ((value as string) ?? null) : '__custom'"
        :options="timeOptions"
        :placeholder="placeholder"
        :disabled="disabled"
        clearable
        @update:value="onTimePreset"
      />
      <NDatePicker
        v-if="timeMode === 'absolute'"
        size="small"
        type="datetime"
        class="param-field__date"
        :value="timestamp"
        :disabled="disabled"
        @update:value="
          (ms: number | null) => emit('change', ms ? new Date(ms).toISOString() : undefined)
        "
      />
    </template>

    <NSelect
      :input-props="{ 'aria-label': param.label ?? param.name }"
      v-else-if="param.type === 'enum'"
      size="small"
      :value="(value as string) ?? null"
      :options="options"
      :placeholder="placeholder"
      :disabled="disabled"
      clearable
      @update:value="(v: string | null) => emit('change', v ?? undefined)"
    />

    <NSelect
      :input-props="{ 'aria-label': param.label ?? param.name }"
      v-else-if="param.type === 'string[]'"
      size="small"
      multiple
      filterable
      :tag="!param.values"
      :remote="hasRemoteValues"
      :loading="values.isFetching.value && !search"
      :value="Array.isArray(value) ? (value as string[]) : []"
      :options="options"
      :placeholder="param.values || hasRemoteValues ? placeholder : 'Type values, Enter to add'"
      :disabled="disabled"
      :max-tag-count="4"
      clearable
      @search="(q: string) => (search = q)"
      @update:value="(v: string[]) => emit('change', v.length ? v : undefined)"
    />

    <NSelect
      :input-props="{ 'aria-label': param.label ?? param.name }"
      v-else-if="param.type === 'string' && hasRemoteValues"
      size="small"
      filterable
      remote
      :loading="values.isFetching.value"
      :value="(value as string) ?? null"
      :options="options"
      :placeholder="placeholder"
      :disabled="disabled"
      clearable
      @search="(q: string) => (search = q)"
      @update:value="(v: string | null) => emit('change', v ?? undefined)"
    />

    <NInputNumber
      v-else-if="param.type === 'int' || param.type === 'float'"
      size="small"
      :value="typeof value === 'number' ? value : null"
      :precision="param.type === 'int' ? 0 : undefined"
      :placeholder="placeholder"
      :disabled="disabled"
      @update:value="(v: number | null) => emit('change', v ?? undefined)"
    />

    <NSwitch
      v-else-if="param.type === 'bool'"
      :value="value === true"
      :disabled="disabled"
      @update:value="(v: boolean) => emit('change', v)"
    />

    <NInput
      v-else
      size="small"
      :value="typeof value === 'string' ? value : ''"
      :placeholder="placeholder"
      :disabled="disabled"
      clearable
      @change="(v: string) => emit('change', v || undefined)"
    />
  </div>
</template>

<style scoped>
.param-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-field__label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.param-field__required {
  color: var(--app-danger);
}

.param-field__bind {
  margin-left: auto;
  padding: 0 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-primary) 10%, transparent);
  font-size: 11px;
}

.param-field__date {
  width: 100%;
}
</style>

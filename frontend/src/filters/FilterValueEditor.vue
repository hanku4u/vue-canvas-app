<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  NButton,
  NDatePicker,
  NRadioButton,
  NRadioGroup,
  NSelect,
  type SelectOption,
} from 'naive-ui'
import type { FilterDimension, FilterValue, TimeRangeValue } from '@/api/types'
import { useDimensionValues } from './dimensions'
import { splitPasted, TIME_PRESETS } from './values'

/** Edits one filter value: a searchable multi-select (with paste-a-list) or a time range. */
const props = defineProps<{
  dimension: FilterDimension
  value: FilterValue | null
  /** Focus the picker when shown (keyboard users land in it). */
  autofocus?: boolean
}>()
const emit = defineEmits<{ change: [value: FilterValue | null] }>()

const search = ref('')
const select = ref<InstanceType<typeof NSelect> | null>(null)
const root = ref<HTMLDivElement | null>(null)

onMounted(async () => {
  if (!props.autofocus) return
  await nextTick()
  if (select.value) select.value.focusInput()
  else root.value?.querySelector<HTMLElement>('input, button')?.focus()
})
const values = useDimensionValues(
  () => props.dimension.id,
  search,
  () => props.dimension.type === 'string_list' && props.dimension.hasValues,
)

const list = computed(() => (Array.isArray(props.value) ? props.value : []))
const options = computed<SelectOption[]>(() =>
  // Narrow stale results (from the previous search) so Enter never picks a non-match.
  [
    ...new Set([
      ...list.value,
      ...(values.data.value?.values ?? []).filter((v) =>
        v.toLowerCase().includes(search.value.toLowerCase()),
      ),
      // Remote mode drops Naive's typed-value tag option; keep it.
      ...(search.value.trim() ? [search.value.trim()] : []),
    ]),
  ].map((v) => ({
    label: v,
    value: v,
  })),
)

/** Pasting "A1 A2\nA3" (e.g. from Excel) adds every value. */
function onPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text') ?? ''
  const pasted = splitPasted(text)
  if (pasted.length < 2) return
  event.preventDefault()
  emit('change', [...new Set([...list.value, ...pasted])])
}

// Time range
const time = computed(() => props.value as TimeRangeValue | null)
const mode = computed(() => (time.value && 'start' in time.value ? 'custom' : 'preset'))
const preset = computed(() => (time.value && 'relative' in time.value ? time.value.relative : null))
const absolute = computed<[number, number] | null>(() =>
  time.value && 'start' in time.value
    ? [Date.parse(time.value.start), Date.parse(time.value.end)]
    : null,
)

function setCustom(range: [number, number] | null): void {
  emit(
    'change',
    range
      ? { start: new Date(range[0]).toISOString(), end: new Date(range[1]).toISOString() }
      : null,
  )
}

function startCustom(): void {
  const end = Math.floor(Date.now() / 60_000) * 60_000
  setCustom([end - 7 * 86_400_000, end])
}
</script>

<template>
  <div ref="root" class="filter-editor" :data-dimension="dimension.id" data-testid="filter-editor">
    <template v-if="dimension.type === 'time_range'">
      <NRadioGroup
        size="small"
        :value="mode === 'preset' ? preset : null"
        @update:value="(v: string) => emit('change', { relative: v })"
      >
        <NRadioButton v-for="p in TIME_PRESETS" :key="p.value" :value="p.value" :label="p.label" />
      </NRadioGroup>
      <NDatePicker
        v-if="mode === 'custom'"
        size="small"
        type="datetimerange"
        :value="absolute"
        @update:value="setCustom"
      />
      <NButton v-else text size="small" @click="startCustom">Custom range…</NButton>
    </template>

    <div v-else class="filter-editor__list" @paste.capture="onPaste">
      <NSelect
        ref="select"
        size="small"
        multiple
        filterable
        tag
        :remote="dimension.hasValues"
        :loading="values.isFetching.value && !search"
        :value="list"
        :options="options"
        :placeholder="dimension.hasValues ? 'Search or paste a list' : 'Type or paste values'"
        :max-tag-count="6"
        :input-props="{ 'aria-label': `${dimension.label} values` }"
        data-testid="filter-values"
        @search="(q: string) => (search = q)"
        @update:value="(v: string[]) => emit('change', v.length ? v : null)"
      />
      <p class="filter-editor__hint">
        Paste a list (one per line or comma-separated) to add them all.
      </p>
    </div>
  </div>
</template>

<style scoped>
.filter-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 360px;
  max-width: calc(100vw - 48px);
}

.filter-editor__hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--app-text-muted);
}
</style>

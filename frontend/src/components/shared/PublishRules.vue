<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NSelect, type SelectOption } from 'naive-ui'
import type { Dataset } from '@/api/types'
import { useFilterDimensions } from '@/filters/dimensions'
import type { PublishRule } from '../table/schema'

/**
 * "Selection sets filters" rules (docs/canvas-ux.md, Filters): each maps a column of the
 * selected rows/points/wafers to a filter dimension in the component's scope.
 */
const props = defineProps<{
  dataset: Dataset
  rules: PublishRule[]
  editable: boolean
  title: string
  hint: string
}>()
const emit = defineEmits<{ change: [rules: PublishRule[]] }>()

const dimensions = useFilterDimensions()
const listDimensions = computed(() =>
  (dimensions.data.value ?? []).filter((d) => d.type === 'string_list'),
)
const columnOptions = computed<SelectOption[]>(() =>
  props.dataset.columns.map((c) => ({ label: c.label ?? c.name, value: c.name })),
)
const dimensionOptions = computed<SelectOption[]>(() =>
  listDimensions.value.map((d) => ({ label: d.label, value: d.id })),
)

function setRule(index: number, patch: Partial<PublishRule>): void {
  emit(
    'change',
    props.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
  )
}

function addRule(): void {
  const ids = listDimensions.value.map((d) => d.id)
  const used = new Set(props.rules.map((r) => r.column))
  const match = props.dataset.columns.find((c) => ids.includes(c.name) && !used.has(c.name))
  const column = match?.name ?? props.dataset.columns[0]?.name ?? ''
  emit('change', [...props.rules, { column, dimension: match ? column : (ids[0] ?? 'lot_id') }])
}

function removeRule(index: number): void {
  emit(
    'change',
    props.rules.filter((_, i) => i !== index),
  )
}
</script>

<template>
  <div class="publish" data-testid="publish-rules">
    <div class="publish__head">
      <span>{{ title }}</span>
      <NButton text size="tiny" :disabled="!editable" data-testid="add-publish" @click="addRule">
        Add
      </NButton>
    </div>
    <div
      v-for="(rule, index) in rules"
      :key="index"
      class="publish__rule"
      data-testid="publish-rule"
    >
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
      <NButton
        text
        size="tiny"
        :disabled="!editable"
        aria-label="Remove rule"
        @click="removeRule(index)"
      >
        ✕
      </NButton>
    </div>
    <p v-if="!rules.length" class="publish__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.publish {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.publish__head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--app-text-muted);
}

.publish__rule {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  gap: 4px;
  align-items: center;
  font-size: 12px;
}

.publish__hint {
  margin: 0;
  font-size: 11px;
  color: var(--app-text-muted);
}
</style>

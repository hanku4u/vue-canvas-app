<script setup lang="ts">
import { computed } from 'vue'
import { NSelect, type SelectOption } from 'naive-ui'
import { useDatasets } from '@/data/query'
import type { ComponentViewProps } from '@/registry/types'
import PublishRules from '../shared/PublishRules.vue'
import type { WaferMapConfig } from './schema'

/** Wafer map extras: the value column, and what clicking a wafer publishes. */
const props = defineProps<ComponentViewProps<WaferMapConfig>>()
const emit = defineEmits<{ 'update-config': [patch: Partial<WaferMapConfig>] }>()

const datasets = useDatasets()
const dataset = computed(() => datasets.data.value?.find((d) => d.id === props.config.dataset))
const valueOptions = computed<SelectOption[]>(() => [
  { label: 'Auto', value: '' },
  ...(dataset.value?.columns ?? [])
    .filter((c) => (c.type === 'float' || c.type === 'int') && !['x', 'y', 'slot'].includes(c.name))
    .map((c) => ({ label: c.label ?? c.name, value: c.name })),
])
</script>

<template>
  <div v-if="dataset" class="wafer-inspector" data-testid="wafer-inspector">
    <label class="wafer-inspector__field">
      <span>Value</span>
      <NSelect
        size="small"
        :value="config.value"
        :options="valueOptions"
        :disabled="!editable"
        @update:value="(v: string) => emit('update-config', { value: v })"
      />
    </label>
    <PublishRules
      :dataset="dataset"
      :rules="config.publish"
      :editable="editable"
      title="Clicked wafers set filters"
      hint="E.g. clicking wafers sets the Wafer filter for the group."
      @change="(publish) => emit('update-config', { publish })"
    />
  </div>
</template>

<style scoped>
.wafer-inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.wafer-inspector__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--app-text-muted);
}
</style>

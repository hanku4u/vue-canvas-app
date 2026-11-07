<script setup lang="ts">
import {
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSwitch,
  NTooltip,
} from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import type { FieldOption, InspectorField } from '@/registry/inspectorFields'
import type { ComponentConfig } from '@/registry/types'

/** Form generated from inspector field descriptors (src/registry/inspectorFields.ts). */
defineProps<{
  fields: InspectorField[]
  config: ComponentConfig
  disabled?: boolean
}>()

const emit = defineEmits<{ change: [key: string, value: unknown] }>()

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function selectOptions(options: FieldOption[]): SelectOption[] {
  return options.map((o) => ({ label: o.label, value: o.value }))
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}
</script>

<template>
  <NForm label-placement="top" size="small" :show-feedback="false" class="schema-form">
    <NFormItem
      v-for="field in fields"
      :key="field.key"
      :label="field.label"
      :data-field="field.key"
    >
      <div class="schema-form__control">
        <NInput
          v-if="field.kind === 'text'"
          :value="textValue(config[field.key])"
          :type="field.multiline ? 'textarea' : 'text'"
          :maxlength="field.maxLength"
          :autosize="field.multiline ? { minRows: 2, maxRows: 8 } : undefined"
          :disabled="disabled"
          @change="(v: string) => emit('change', field.key, v)"
        />
        <NInputNumber
          v-else-if="field.kind === 'number'"
          :value="numberValue(config[field.key])"
          :min="field.min"
          :max="field.max"
          :step="field.step ?? 1"
          :precision="field.integer ? 0 : undefined"
          :disabled="disabled"
          @update:value="(v: number | null) => v !== null && emit('change', field.key, v)"
        />
        <NSwitch
          v-else-if="field.kind === 'boolean'"
          :value="config[field.key] === true"
          :disabled="disabled"
          @update:value="(v: boolean) => emit('change', field.key, v)"
        />
        <div
          v-else-if="field.kind === 'select' && field.widget === 'swatches'"
          class="swatches"
          role="radiogroup"
          :aria-label="field.label"
        >
          <NTooltip v-for="option in field.options" :key="option.value">
            <template #trigger>
              <button
                type="button"
                role="radio"
                class="swatch"
                :class="{ 'is-selected': config[field.key] === option.value }"
                :style="{ background: option.swatch ?? option.value }"
                :aria-checked="config[field.key] === option.value"
                :aria-label="option.label"
                :disabled="disabled"
                :data-value="option.value"
                @click="emit('change', field.key, option.value)"
              />
            </template>
            {{ option.label }}
          </NTooltip>
        </div>
        <NRadioGroup
          v-else-if="field.kind === 'select' && field.widget === 'segmented'"
          :value="config[field.key] as string"
          :disabled="disabled"
          size="small"
          @update:value="(v: string) => emit('change', field.key, v)"
        >
          <NRadioButton
            v-for="option in field.options"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </NRadioGroup>
        <NSelect
          v-else-if="field.kind === 'select'"
          :value="config[field.key] as string"
          :options="selectOptions(field.options)"
          :disabled="disabled"
          @update:value="(v: string) => emit('change', field.key, v)"
        />
        <NSelect
          v-else-if="field.kind === 'multiselect'"
          multiple
          :value="arrayValue(config[field.key])"
          :options="selectOptions(field.options)"
          :disabled="disabled"
          @update:value="(v: string[]) => emit('change', field.key, v)"
        />
        <p v-if="field.help" class="schema-form__help">{{ field.help }}</p>
      </div>
    </NFormItem>
  </NForm>
</template>

<style scoped>
.schema-form__control {
  width: 100%;
}

.schema-form__help {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--app-text-muted);
}

.swatches {
  display: flex;
  gap: 8px;
}

.swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  cursor: pointer;
}

.swatch.is-selected {
  outline: 2px solid var(--app-primary);
  outline-offset: 2px;
}

.swatch:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>

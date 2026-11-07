<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NForm, NFormItem, NInput, NModal, type FormInst, type FormRules } from 'naive-ui'

export type CanvasNameDialogMode = 'create' | 'rename' | 'duplicate'

const props = defineProps<{
  mode: CanvasNameDialogMode
  initialTitle?: string
  initialDescription?: string
  loading?: boolean
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  submit: [value: { title: string; description: string }]
}>()

const MAX_TITLE = 120
const MAX_DESCRIPTION = 1000

const form = ref({ title: '', description: '' })
const formRef = ref<FormInst | null>(null)

watch(show, (visible) => {
  if (visible) {
    form.value = {
      title: props.initialTitle ?? '',
      description: props.initialDescription ?? '',
    }
  }
})

const copy = computed(() => {
  switch (props.mode) {
    case 'create':
      return { heading: 'New canvas', action: 'Create' }
    case 'rename':
      return { heading: 'Rename canvas', action: 'Save' }
    case 'duplicate':
      return { heading: 'Duplicate canvas', action: 'Duplicate' }
  }
  return { heading: '', action: '' }
})

const withDescription = computed(() => props.mode !== 'duplicate')

const rules: FormRules = {
  title: [
    { required: true, whitespace: true, message: 'Enter a title', trigger: ['input', 'blur'] },
    { max: MAX_TITLE, message: `At most ${MAX_TITLE} characters`, trigger: ['input'] },
  ],
}

async function submit(): Promise<void> {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  emit('submit', {
    title: form.value.title.trim(),
    description: form.value.description.trim(),
  })
}
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    :title="copy.heading"
    :style="{ width: 'min(480px, calc(100vw - 32px))' }"
    :mask-closable="!loading"
    :close-on-esc="!loading"
    data-testid="canvas-name-dialog"
  >
    <NForm ref="formRef" :model="form" :rules="rules" @submit.prevent="submit">
      <NFormItem label="Title" path="title">
        <NInput
          v-model:value="form.title"
          placeholder="e.g. ET-03 CD excursion"
          :maxlength="MAX_TITLE"
          autofocus
          data-testid="canvas-title-input"
          @keydown.enter.prevent="submit"
        />
      </NFormItem>
      <NFormItem v-if="withDescription" label="Description" path="description">
        <NInput
          v-model:value="form.description"
          type="textarea"
          placeholder="What is this canvas for? (optional)"
          :maxlength="MAX_DESCRIPTION"
          :autosize="{ minRows: 2, maxRows: 5 }"
        />
      </NFormItem>
    </NForm>
    <template #footer>
      <div class="dialog-footer">
        <NButton :disabled="loading" @click="show = false">Cancel</NButton>
        <NButton type="primary" :loading="loading" data-testid="canvas-name-submit" @click="submit">
          {{ copy.action }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

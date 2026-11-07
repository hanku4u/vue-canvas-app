<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NModal } from 'naive-ui'
import type { CanvasComponent, VersionConflict } from '@/api/types'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { formatRelativeTime } from '@/ui/format'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{ conflicts: VersionConflict[] }>()
const emit = defineEmits<{ resolve: [choice: 'theirs' | 'mine'] }>()

const store = useCanvasDocStore()

const rows = computed(() =>
  props.conflicts.map((conflict) => {
    const theirs = conflict.current as CanvasComponent | null
    const mine = store.components[conflict.id]
    return {
      id: conflict.id,
      title: mine?.title ?? theirs?.title ?? 'A component',
      what: !theirs
        ? 'was deleted by someone else'
        : `was changed by ${theirs.updatedBy || 'someone else'} ${formatRelativeTime(theirs.updatedAt)}`,
      mineWhat: mine ? 'You also changed it.' : 'You deleted it.',
    }
  }),
)

function choose(choice: 'theirs' | 'mine'): void {
  emit('resolve', choice)
  show.value = false
}
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    title="Edit conflict"
    :style="{ width: 'min(520px, calc(100vw - 32px))' }"
    :mask-closable="false"
    data-testid="conflict-dialog"
  >
    <p class="conflict__intro">
      While you were editing, someone else saved changes to the same
      {{ rows.length === 1 ? 'component' : 'components' }}:
    </p>
    <ul class="conflict__list">
      <li v-for="row in rows" :key="row.id">
        <strong>{{ row.title }}</strong> {{ row.what }}. {{ row.mineWhat }}
      </li>
    </ul>
    <p class="conflict__hint">
      <strong>Keep theirs</strong> discards your change. <strong>Reapply mine</strong> saves your
      version on top of theirs.
    </p>
    <template #footer>
      <div class="conflict__footer">
        <NButton data-testid="conflict-keep-theirs" @click="choose('theirs')">Keep theirs</NButton>
        <NButton type="primary" data-testid="conflict-reapply-mine" @click="choose('mine')">
          Reapply mine
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.conflict__intro,
.conflict__hint {
  margin: 0 0 8px;
}

.conflict__hint {
  color: var(--app-text-muted);
  font-size: 13px;
}

.conflict__list {
  margin: 0 0 12px;
  padding-left: 18px;
}

.conflict__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

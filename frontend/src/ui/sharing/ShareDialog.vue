<script setup lang="ts">
import { ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { NAlert, NButton, NModal, NSelect, NSpin, useMessage } from 'naive-ui'
import { canvasKeys } from '@/api/canvases'
import { getShares, putShares } from '@/api/sharing'
import type { Share, ShareRole } from '@/api/types'
import { describeError } from '@/ui/useApiErrorNotifier'
import UserPicker from './UserPicker.vue'

/** Share a canvas: people and their role (docs/permissions.md). Owner and admins only. */
const props = defineProps<{ canvasId: string; ownerId: string; ownerName: string }>()
const show = defineModel<boolean>('show', { required: true })

const message = useMessage()
const queryClient = useQueryClient()
const shares = ref<Share[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const ROLES = [
  { label: 'Can edit', value: 'editor' },
  { label: 'Can view', value: 'viewer' },
]

watch(show, async (visible) => {
  if (!visible) return
  loading.value = true
  error.value = null
  try {
    shares.value = (await getShares(props.canvasId)).shares
  } catch (e) {
    error.value = describeError(e)
  } finally {
    loading.value = false
  }
})

function add(user: { knoxId: string; displayName: string }): void {
  shares.value = [...shares.value, { ...user, role: 'viewer' }]
}

function setRole(knoxId: string, role: ShareRole): void {
  shares.value = shares.value.map((s) => (s.knoxId === knoxId ? { ...s, role } : s))
}

function remove(knoxId: string): void {
  shares.value = shares.value.filter((s) => s.knoxId !== knoxId)
}

async function save(): Promise<void> {
  saving.value = true
  error.value = null
  try {
    shares.value = (await putShares(props.canvasId, shares.value)).shares
    void queryClient.invalidateQueries({ queryKey: canvasKeys.all })
    message.success('Sharing updated')
    show.value = false
  } catch (e) {
    error.value = describeError(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    title="Share canvas"
    class="share-dialog"
    style="width: 480px; max-width: calc(100vw - 32px)"
    data-testid="share-dialog"
  >
    <NSpin :show="loading">
      <div class="share">
        <UserPicker :exclude="[ownerId, ...shares.map((s) => s.knoxId)]" @pick="add" />
        <ul class="share__list">
          <li class="share__row">
            <span class="share__name"
              >{{ ownerName }} <small>({{ ownerId }})</small></span
            >
            <span class="share__fixed">Owner</span>
          </li>
          <li
            v-for="share in shares"
            :key="share.knoxId"
            class="share__row"
            :data-user="share.knoxId"
            data-testid="share-row"
          >
            <span class="share__name">
              {{ share.displayName ?? share.knoxId }} <small>({{ share.knoxId }})</small>
            </span>
            <NSelect
              size="small"
              class="share__role"
              :value="share.role"
              :options="ROLES"
              data-testid="share-role"
              @update:value="(v: ShareRole) => setRole(share.knoxId, v)"
            />
            <NButton
              text
              size="small"
              :aria-label="`Remove ${share.knoxId}`"
              @click="remove(share.knoxId)"
            >
              ✕
            </NButton>
          </li>
        </ul>
        <p class="share__hint">
          Admins can open every canvas. Individual components can be restricted further from their
          menu (“Restrict access…”).
        </p>
        <NAlert v-if="error" type="error" :show-icon="false">{{ error }}</NAlert>
      </div>
    </NSpin>
    <template #footer>
      <div class="share__actions">
        <NButton @click="show = false">Cancel</NButton>
        <NButton type="primary" :loading="saving" data-testid="share-save" @click="save">
          Save
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.share {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.share__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.share__row {
  display: grid;
  grid-template-columns: 1fr 120px 20px;
  align-items: center;
  gap: 8px;
  min-height: 30px;
}

.share__name small,
.share__fixed,
.share__hint {
  color: var(--app-text-muted);
}

.share__fixed {
  grid-column: 2 / 4;
  font-size: 13px;
}

.share__hint {
  margin: 0;
  font-size: 12px;
}

.share__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

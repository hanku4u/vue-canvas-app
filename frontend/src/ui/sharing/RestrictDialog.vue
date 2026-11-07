<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { NAlert, NButton, NCheckbox, NModal, NSelect, NSpin, useMessage } from 'naive-ui'
import { canvasKeys } from '@/api/canvases'
import { getComponentAccess, putComponentAccess } from '@/api/sharing'
import type { AclEntry } from '@/api/types'
import { describeError } from '@/ui/useApiErrorNotifier'
import UserPicker from './UserPicker.vue'

/**
 * "Restrict access…" for one component (docs/permissions.md, "Component restrictions"):
 * hide it from, or lock it against, everyone not listed. Owner and admins only, and they
 * always keep full access.
 */
const props = defineProps<{ canvasId: string; componentId: string; componentTitle: string }>()
const show = defineModel<boolean>('show', { required: true })

const message = useMessage()
const queryClient = useQueryClient()
const viewRestricted = ref(false)
const editRestricted = ref(false)
const acl = ref<AclEntry[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

watch(
  show,
  async (visible) => {
    if (!visible) return
    loading.value = true
    error.value = null
    try {
      const current = await getComponentAccess(props.canvasId, props.componentId)
      viewRestricted.value = current.viewRestricted
      editRestricted.value = current.editRestricted
      acl.value = current.acl
    } catch (e) {
      error.value = describeError(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const restricted = computed(() => viewRestricted.value || editRestricted.value)
const ACCESS = computed(() => [
  { label: 'Can view', value: 'view', disabled: !viewRestricted.value && editRestricted.value },
  { label: 'Can edit', value: 'edit' },
])

const summary = computed(() => {
  if (viewRestricted.value) {
    return 'Only the owner, admins and the people below can see this component. Everyone else won’t know it exists.'
  }
  if (editRestricted.value) {
    return 'Everyone with access to the canvas can see it, but only the owner, admins and people below with “Can edit” can change it.'
  }
  return 'Anyone with access to the canvas can see it; canvas editors can change it.'
})

function add(user: { knoxId: string; displayName: string }): void {
  acl.value = [...acl.value, { ...user, access: editRestricted.value ? 'edit' : 'view' }]
}

async function save(): Promise<void> {
  saving.value = true
  error.value = null
  try {
    await putComponentAccess(props.canvasId, props.componentId, {
      viewRestricted: viewRestricted.value,
      editRestricted: editRestricted.value,
      acl: restricted.value ? acl.value : [],
    })
    await queryClient.invalidateQueries({ queryKey: canvasKeys.detail(props.canvasId) })
    message.success('Access updated')
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
    :title="`Restrict access – ${componentTitle}`"
    style="width: 480px; max-width: calc(100vw - 32px)"
    data-testid="restrict-dialog"
  >
    <NSpin :show="loading">
      <div class="restrict">
        <NCheckbox v-model:checked="viewRestricted" data-testid="restrict-view">
          Hide from everyone not listed
        </NCheckbox>
        <NCheckbox v-model:checked="editRestricted" data-testid="restrict-edit">
          Only listed people can edit
        </NCheckbox>
        <p class="restrict__summary" data-testid="restrict-summary">{{ summary }}</p>
        <template v-if="restricted">
          <UserPicker :exclude="acl.map((a) => a.knoxId)" @pick="add" />
          <ul class="restrict__list">
            <li
              v-for="entry in acl"
              :key="entry.knoxId"
              class="restrict__row"
              :data-user="entry.knoxId"
              data-testid="acl-row"
            >
              <span>
                {{ entry.displayName ?? entry.knoxId }} <small>({{ entry.knoxId }})</small>
              </span>
              <NSelect
                size="small"
                :value="entry.access"
                :options="ACCESS"
                @update:value="
                  (v: 'view' | 'edit') =>
                    (acl = acl.map((a) => (a.knoxId === entry.knoxId ? { ...a, access: v } : a)))
                "
              />
              <NButton
                text
                size="small"
                :aria-label="`Remove ${entry.knoxId}`"
                @click="acl = acl.filter((a) => a.knoxId !== entry.knoxId)"
              >
                ✕
              </NButton>
            </li>
          </ul>
        </template>
        <NAlert v-if="error" type="error" :show-icon="false">{{ error }}</NAlert>
      </div>
    </NSpin>
    <template #footer>
      <div class="restrict__actions">
        <NButton @click="show = false">Cancel</NButton>
        <NButton type="primary" :loading="saving" data-testid="restrict-save" @click="save">
          Save
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.restrict {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.restrict__summary {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-muted);
}

.restrict__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.restrict__row {
  display: grid;
  grid-template-columns: 1fr 110px 20px;
  align-items: center;
  gap: 8px;
}

.restrict__row small {
  color: var(--app-text-muted);
}

.restrict__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

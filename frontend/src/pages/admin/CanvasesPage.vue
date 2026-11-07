<script setup lang="ts">
import { computed, h, ref, type HTMLAttributes } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  NButton,
  NCheckbox,
  NDataTable,
  NDropdown,
  NInput,
  NModal,
  NSelect,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { adminApi, useAdminCanvases, useAdminMutation, type AdminCanvas } from '@/api/admin'
import { useUserSearch } from '@/api/sharing'
import type { UserRef } from '@/api/types'
import { formatRelativeTime } from '@/ui/format'
import ShareDialog from '@/ui/sharing/ShareDialog.vue'
import UserPicker from '@/ui/sharing/UserPicker.vue'
import { describeError } from '@/ui/useApiErrorNotifier'
import AdminState from './AdminState.vue'
import { useQueryParam } from './useRange'

/** Every canvas, including deleted ones, with access tools (docs/admin.md, Canvases). */
const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const search = useQueryParam('search')
const owner = useQueryParam('owner')
const showDeleted = useQueryParam('deleted')
const params = computed(() => ({
  search: search.value,
  owner: owner.value,
  deleted: showDeleted.value === 'true',
}))
const canvases = useAdminCanvases(params)

const users = useUserSearch('')
const ownerOptions = computed(() => [
  { label: 'Any owner', value: '' },
  ...(users.data.value ?? []).map((u) => ({
    label: `${u.displayName} (${u.knoxId})`,
    value: u.knoxId,
  })),
])

// Row actions
const sharing = ref<AdminCanvas | null>(null)
const showShare = computed({
  get: () => !!sharing.value,
  set: (v: boolean) => {
    if (!v) sharing.value = null
  },
})
const transferring = ref<AdminCanvas | null>(null)
const newOwner = ref<UserRef | null>(null)
const keepPrevious = ref(true)

const transfer = useAdminMutation(adminApi.transfer)
const restore = useAdminMutation(adminApi.restore)
const remove = useAdminMutation(adminApi.remove)

async function run(action: Promise<unknown>, done: string): Promise<void> {
  try {
    await action
    message.success(done)
  } catch (error) {
    message.error(describeError(error))
  }
}

async function confirmTransfer(): Promise<void> {
  const canvas = transferring.value
  if (!canvas || !newOwner.value) return
  await run(
    transfer.mutateAsync({
      id: canvas.id,
      newOwner: newOwner.value.knoxId,
      keepPreviousAsEditor: keepPrevious.value,
    }),
    `“${canvas.title}” now belongs to ${newOwner.value.displayName}`,
  )
  transferring.value = null
}

function onAction(key: string, row: AdminCanvas): void {
  if (key === 'open') void router.push({ name: 'canvas', params: { id: row.id } })
  if (key === 'access') sharing.value = row
  if (key === 'transfer') {
    transferring.value = row
    newOwner.value = null
    keepPrevious.value = true
  }
  if (key === 'restore') void run(restore.mutateAsync(row.id), `Restored “${row.title}”`)
  if (key === 'delete') {
    dialog.warning({
      title: 'Delete canvas?',
      content: `“${row.title}” moves to deleted canvases and can be restored here.`,
      positiveText: 'Delete',
      negativeText: 'Cancel',
      onPositiveClick: () => run(remove.mutateAsync(row.id), `Deleted “${row.title}”`),
    })
  }
}

const columns = computed<DataTableColumns<AdminCanvas>>(() => [
  {
    title: 'Title',
    key: 'title',
    render: (row) =>
      row.deletedAt
        ? [
            row.title,
            ' ',
            h(NTag, { size: 'small', type: 'error', bordered: false }, () => 'deleted'),
          ]
        : h(RouterLink, { to: { name: 'canvas', params: { id: row.id } } }, () => row.title),
  },
  {
    title: 'Owner',
    key: 'owner',
    render: (row) => [
      row.owner.displayName,
      ' ',
      h('small', { class: 'muted' }, `(${row.owner.knoxId})`),
    ],
  },
  { title: 'Shares', key: 'shareCount', align: 'right' },
  { title: 'Components', key: 'componentCount', align: 'right' },
  { title: 'Restricted', key: 'restrictedCount', align: 'right' },
  {
    title: 'Updated',
    key: 'updatedAt',
    render: (row) => formatRelativeTime(row.updatedAt),
  },
  {
    title: '',
    key: 'actions',
    align: 'right',
    render: (row) =>
      h(
        NDropdown,
        {
          trigger: 'click',
          options: row.deletedAt
            ? [{ key: 'restore', label: 'Restore' }]
            : [
                { key: 'open', label: 'Open' },
                { key: 'access', label: 'Manage access…' },
                { key: 'transfer', label: 'Transfer ownership…' },
                { type: 'divider', key: 'd' },
                { key: 'delete', label: 'Delete' },
              ],
          onSelect: (key: string) => onAction(key, row),
        },
        () =>
          h(
            NButton,
            { size: 'tiny', quaternary: true, 'data-testid': `canvas-actions-${row.id}` },
            () => '⋯',
          ),
      ),
  },
])
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h2>All canvases</h2>
      <div class="page__tools">
        <NInput
          v-model:value="search"
          size="small"
          clearable
          placeholder="Search titles"
          style="width: 220px"
          data-testid="canvas-search"
        />
        <NSelect
          v-model:value="owner"
          size="small"
          :options="ownerOptions"
          style="width: 200px"
          data-testid="owner-filter"
        />
        <NCheckbox
          :checked="showDeleted === 'true'"
          data-testid="show-deleted"
          @update:checked="(v: boolean) => (showDeleted = v ? 'true' : '')"
        >
          Show deleted
        </NCheckbox>
      </div>
    </header>
    <AdminState
      :pending="canvases.isPending.value"
      :error="canvases.error.value"
      :empty="!canvases.data.value?.length"
      empty-text="No canvases match."
      @retry="canvases.refetch()"
    >
      <NDataTable
        :columns="columns"
        :data="canvases.data.value ?? []"
        :row-key="(r: AdminCanvas) => r.id"
        :row-props="(r: AdminCanvas) => ({ 'data-canvas': r.id }) as HTMLAttributes"
        size="small"
        data-testid="canvases-table"
      />
    </AdminState>

    <ShareDialog
      v-if="sharing"
      v-model:show="showShare"
      :canvas-id="sharing.id"
      :owner-id="sharing.owner.knoxId"
      :owner-name="sharing.owner.displayName"
    />

    <NModal
      :show="!!transferring"
      preset="card"
      title="Transfer ownership"
      style="width: 440px; max-width: calc(100vw - 32px)"
      data-testid="transfer-dialog"
      @update:show="(v: boolean) => !v && (transferring = null)"
    >
      <div class="transfer">
        <p>
          “{{ transferring?.title }}” is owned by {{ transferring?.owner.displayName }}. New owner:
        </p>
        <p v-if="newOwner" class="transfer__picked" data-testid="transfer-picked">
          {{ newOwner.displayName }} ({{ newOwner.knoxId }})
          <NButton text size="tiny" @click="newOwner = null">change</NButton>
        </p>
        <UserPicker
          v-else
          :exclude="transferring ? [transferring.owner.knoxId] : []"
          @pick="(u) => (newOwner = u)"
        />
        <NCheckbox v-model:checked="keepPrevious">Keep the previous owner as an editor</NCheckbox>
      </div>
      <template #footer>
        <div class="transfer__actions">
          <NButton @click="transferring = null">Cancel</NButton>
          <NButton
            type="primary"
            :disabled="!newOwner"
            :loading="transfer.isPending.value"
            data-testid="transfer-confirm"
            @click="confirmTransfer"
          >
            Transfer
          </NButton>
        </div>
      </template>
    </NModal>
  </section>
</template>

<style scoped src="./page.css"></style>
<style scoped>
.transfer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.transfer p {
  margin: 0;
}

.transfer__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

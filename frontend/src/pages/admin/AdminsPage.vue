<script setup lang="ts">
import { computed, h } from 'vue'
import { NButton, NDataTable, NPopconfirm, NTag, useMessage, type DataTableColumns } from 'naive-ui'
import { adminApi, useAdminMutation, useAdmins, type AdminEntry } from '@/api/admin'
import { useMe } from '@/api/me'
import { formatDateTime } from '@/ui/format'
import UserPicker from '@/ui/sharing/UserPicker.vue'
import { describeError } from '@/ui/useApiErrorNotifier'
import AdminState from './AdminState.vue'

/** Admins: granted here (removable) and bootstrap admins from config (docs/admin.md). */
const admins = useAdmins()
const me = useMe()
const message = useMessage()

const grant = useAdminMutation(adminApi.grant)
const revoke = useAdminMutation(adminApi.revoke)

async function add(user: { knoxId: string; displayName: string }): Promise<void> {
  try {
    await grant.mutateAsync(user.knoxId)
    message.success(`${user.displayName} is now an admin`)
  } catch (error) {
    message.error(describeError(error))
  }
}

async function remove(row: AdminEntry): Promise<void> {
  try {
    await revoke.mutateAsync(row.knoxId)
    message.success(`Removed ${row.displayName}`)
  } catch (error) {
    message.error(describeError(error))
  }
}

const columns = computed<DataTableColumns<AdminEntry>>(() => [
  {
    title: 'Name',
    key: 'displayName',
    render: (row) => [row.displayName, ' ', h('small', { class: 'muted' }, `(${row.knoxId})`)],
  },
  {
    title: 'Source',
    key: 'source',
    render: (row) =>
      row.source === 'config'
        ? h(NTag, { size: 'small', bordered: false }, () => 'from config')
        : 'granted here',
  },
  { title: 'Granted by', key: 'grantedBy', render: (row) => row.grantedBy ?? '—' },
  {
    title: 'Granted',
    key: 'grantedAt',
    render: (row) => (row.grantedAt ? formatDateTime(row.grantedAt) : '—'),
  },
  {
    title: '',
    key: 'actions',
    align: 'right',
    render: (row) =>
      row.source === 'db'
        ? h(
            NPopconfirm,
            { onPositiveClick: () => remove(row), positiveText: 'Remove' },
            {
              trigger: () =>
                h(
                  NButton,
                  { size: 'tiny', quaternary: true, 'data-testid': `remove-admin-${row.knoxId}` },
                  () => 'Remove',
                ),
              default: () =>
                row.knoxId === me.data.value?.knoxId
                  ? 'Remove your own admin rights?'
                  : `Remove ${row.displayName} as admin?`,
            },
          )
        : null,
  },
])
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h2>Admins</h2>
      <div class="page__tools">
        <UserPicker
          :exclude="(admins.data.value ?? []).map((a) => a.knoxId)"
          placeholder="Add an admin…"
          class="page__picker"
          @pick="add"
        />
      </div>
    </header>
    <p class="page__intro">
      Admins can open every canvas, manage access and see usage. Admins from config
      (<code>BOOTSTRAP_ADMINS</code>) can only be removed there.
    </p>
    <AdminState
      :pending="admins.isPending.value"
      :error="admins.error.value"
      @retry="admins.refetch()"
    >
      <NDataTable
        :columns="columns"
        :data="admins.data.value ?? []"
        :row-key="(r: AdminEntry) => r.knoxId"
        size="small"
        data-testid="admins-table"
      />
    </AdminState>
  </section>
</template>

<style scoped src="./page.css"></style>

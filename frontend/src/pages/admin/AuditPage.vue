<script setup lang="ts">
import { computed, h } from 'vue'
import { NDataTable, NSelect, type DataTableColumns } from 'naive-ui'
import { useAudit, type AuditEntry } from '@/api/admin'
import { useUserSearch } from '@/api/sharing'
import { formatDateTime } from '@/ui/format'
import AdminState from './AdminState.vue'
import RangeSelect from './RangeSelect.vue'
import { useQueryParam, useRange } from './useRange'

/** Audit log (docs/permissions.md#audit), filterable by person and action. */
const range = useRange()
const actor = useQueryParam('actor')
const action = useQueryParam('action')
const audit = useAudit(() => ({ range: range.value, actor: actor.value, action: action.value }))
const users = useUserSearch('')

const actorOptions = computed(() => [
  { label: 'Anyone', value: '' },
  ...(users.data.value ?? []).map((u) => ({
    label: `${u.displayName} (${u.knoxId})`,
    value: u.knoxId,
  })),
])
const actionOptions = computed(() => [
  { label: 'All actions', value: '' },
  ...(audit.data.value?.actions ?? []).map((a) => ({ label: a, value: a })),
])

function details(d: Record<string, unknown>): string {
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ')
}

const columns: DataTableColumns<AuditEntry> = [
  { title: 'Time', key: 'ts', width: 180, render: (r) => formatDateTime(r.ts) },
  {
    title: 'Who',
    key: 'actor',
    render: (r) => [
      r.actor.displayName,
      ' ',
      h('small', { class: 'muted' }, `(${r.actor.knoxId})`),
    ],
  },
  { title: 'Action', key: 'action', render: (r) => h('code', r.action) },
  { title: 'Target', key: 'target' },
  {
    title: 'Details',
    key: 'details',
    ellipsis: { tooltip: true },
    render: (r) => details(r.details),
  },
]
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h2>Audit log</h2>
      <div class="page__tools">
        <NSelect
          v-model:value="actor"
          size="small"
          :options="actorOptions"
          style="width: 200px"
          data-testid="audit-actor"
        />
        <NSelect
          v-model:value="action"
          size="small"
          :options="actionOptions"
          style="width: 180px"
          data-testid="audit-action"
        />
        <RangeSelect />
      </div>
    </header>
    <AdminState
      :pending="audit.isPending.value"
      :error="audit.error.value"
      :empty="!audit.data.value?.items.length"
      empty-text="No audit entries match."
      @retry="audit.refetch()"
    >
      <NDataTable
        :columns="columns"
        :data="audit.data.value?.items ?? []"
        :row-key="(r: AuditEntry) => r.id"
        size="small"
        :pagination="{ pageSize: 50 }"
        :scroll-x="900"
        data-testid="audit-table"
      />
    </AdminState>
  </section>
</template>

<style scoped src="./page.css"></style>

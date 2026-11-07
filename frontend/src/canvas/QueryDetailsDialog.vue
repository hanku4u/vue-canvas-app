<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NModal } from 'naive-ui'
import { ApiError } from '@/api/client'
import type { ComponentDataInfo } from '@/stores/componentData'
import { formatDateTime } from '@/ui/format'

/** "View query details": what a data component asked for and what came back. */
const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{ title: string; info: ComponentDataInfo | undefined }>()

const rows = computed(() => {
  const meta = props.info?.meta
  if (!meta) return []
  const list: [string, string][] = [
    ['Rows from the data API', meta.rowsUpstream.toLocaleString()],
    ['Rows returned', meta.rowsReturned.toLocaleString()],
    ['Downsampled', meta.downsampled ? 'yes' : 'no'],
    ['Served from cache', meta.cacheHit ? 'yes' : 'no'],
    ['Total time', `${meta.durationMs} ms`],
    ['Data API time', `${meta.upstreamMs} ms`],
    ['Data as of', formatDateTime(meta.asOf)],
  ]
  if (meta.totalRows !== undefined)
    list.push(['Rows after column filters', meta.totalRows.toLocaleString()])
  if (meta.requestId) list.push(['Request id', meta.requestId])
  return list
})

const request = computed(() => {
  const r = props.info?.request
  return r ? JSON.stringify({ dataset: r.dataset, params: r.params, shape: r.shape }, null, 2) : ''
})

const error = computed(() => {
  const e = props.info?.error
  if (!e) return ''
  return e instanceof ApiError
    ? `${e.code}: ${e.message}${e.requestId ? ` (request ${e.requestId})` : ''}`
    : e.message
})

function copy(): void {
  void navigator.clipboard?.writeText(request.value)
}
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    :title="`Query details – ${title}`"
    :style="{ width: 'min(640px, calc(100vw - 32px))' }"
    data-testid="query-details"
  >
    <p v-if="!info?.request" class="details__muted">This component hasn't run a query yet.</p>
    <template v-else>
      <h4 class="details__heading">Request</h4>
      <pre class="details__code">{{ request }}</pre>
      <h4 v-if="rows.length" class="details__heading">Result</h4>
      <table v-if="rows.length" class="details__table">
        <tbody>
          <tr v-for="[label, value] in rows" :key="label">
            <th>{{ label }}</th>
            <td>{{ value }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="error" class="details__error">{{ error }}</p>
    </template>
    <template #footer>
      <div class="details__footer">
        <NButton size="small" :disabled="!request" @click="copy">Copy request</NButton>
        <NButton size="small" type="primary" @click="show = false">Close</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.details__heading {
  margin: 0 0 6px;
  font-size: 13px;
}

.details__code {
  max-height: 240px;
  overflow: auto;
  margin: 0 0 12px;
  padding: 8px;
  border-radius: 6px;
  background: var(--app-bg);
  font-size: 12px;
}

.details__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.details__table th {
  width: 45%;
  padding: 2px 8px 2px 0;
  text-align: left;
  font-weight: 400;
  color: var(--app-text-muted);
}

.details__muted {
  color: var(--app-text-muted);
}

.details__error {
  color: var(--app-danger);
}

.details__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

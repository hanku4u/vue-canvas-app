<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { NButton, NList, NListItem, NTag, useDialog, useMessage } from 'naive-ui'
import { adminApi, useAdminMutation, useUserAccess } from '@/api/admin'
import type { UserRef } from '@/api/types'
import UserPicker from '@/ui/sharing/UserPicker.vue'
import { describeError } from '@/ui/useApiErrorNotifier'
import AdminCard from './AdminCard.vue'
import AdminState from './AdminState.vue'
import { useQueryParam } from './useRange'

/** "What can this person access?" with bulk actions (docs/admin.md, User access lookup). */
const knoxId = useQueryParam('user')
const access = useUserAccess(knoxId)
const message = useMessage()
const dialog = useDialog()

const revoke = useAdminMutation(adminApi.revokeShares)
const transferAll = useAdminMutation(adminApi.transferAll)
const transferTo = ref<UserRef | null>(null)

function confirmRevoke(): void {
  const user = access.data.value?.user
  if (!user) return
  dialog.warning({
    title: 'Remove all shares?',
    content: `${user.displayName} loses access to every canvas shared with them. Canvases they own are kept.`,
    positiveText: 'Remove shares',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        const result = (await revoke.mutateAsync(user.knoxId)) as { removed: number }
        message.success(`Removed ${result.removed} shares`)
      } catch (error) {
        message.error(describeError(error))
      }
    },
  })
}

function confirmTransfer(): void {
  const user = access.data.value?.user
  const to = transferTo.value
  if (!user || !to) return
  dialog.warning({
    title: 'Transfer all canvases?',
    content: `Every canvas owned by ${user.displayName} will belong to ${to.displayName}.`,
    positiveText: 'Transfer',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        const result = (await transferAll.mutateAsync({
          knoxId: user.knoxId,
          newOwner: to.knoxId,
        })) as { transferred: number }
        message.success(`Transferred ${result.transferred} canvases to ${to.displayName}`)
        transferTo.value = null
      } catch (error) {
        message.error(describeError(error))
      }
    },
  })
}
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h2>User access</h2>
      <div class="page__tools">
        <UserPicker
          :exclude="[]"
          placeholder="Look up a person…"
          class="page__picker"
          @pick="(u) => (knoxId = u.knoxId)"
        />
      </div>
    </header>

    <p v-if="!knoxId" class="page__intro" data-testid="access-prompt">
      Pick a person to see what they own, what is shared with them and which components are
      restricted for them.
    </p>
    <AdminState
      v-else
      :pending="access.isPending.value"
      :error="access.error.value"
      @retry="access.refetch()"
    >
      <template v-if="access.data.value">
        <div class="access__who" data-testid="access-user">
          <strong>{{ access.data.value.user.displayName }}</strong>
          <span class="muted">({{ access.data.value.user.knoxId }})</span>
          <NTag v-if="access.data.value.isAdmin" size="small" type="info" :bordered="false">
            admin
          </NTag>
        </div>

        <div class="access__grid">
          <AdminCard size="small" :title="`Owns (${access.data.value.owned.length})`">
            <NList v-if="access.data.value.owned.length" data-testid="access-owned">
              <NListItem v-for="c in access.data.value.owned" :key="c.id">
                <RouterLink :to="{ name: 'canvas', params: { id: c.id } }">{{
                  c.title
                }}</RouterLink>
              </NListItem>
            </NList>
            <p v-else class="muted">No canvases.</p>
          </AdminCard>

          <AdminCard size="small" :title="`Shared with them (${access.data.value.shared.length})`">
            <NList v-if="access.data.value.shared.length" data-testid="access-shared">
              <NListItem v-for="c in access.data.value.shared" :key="c.id">
                <RouterLink :to="{ name: 'canvas', params: { id: c.id } }">{{
                  c.title
                }}</RouterLink>
                <span class="muted"> · {{ c.role }} · owner {{ c.owner.displayName }}</span>
              </NListItem>
            </NList>
            <p v-else class="muted">Nothing shared.</p>
          </AdminCard>

          <AdminCard
            size="small"
            :title="`On component access lists (${access.data.value.acl.length})`"
          >
            <NList v-if="access.data.value.acl.length">
              <NListItem v-for="a in access.data.value.acl" :key="a.componentId">
                {{ a.componentTitle }}
                <span class="muted"> · {{ a.access }} · {{ a.canvasTitle }}</span>
              </NListItem>
            </NList>
            <p v-else class="muted">None.</p>
          </AdminCard>

          <AdminCard
            size="small"
            :title="`Hidden from them (${access.data.value.hiddenFrom.length})`"
          >
            <NList v-if="access.data.value.hiddenFrom.length" data-testid="access-hidden">
              <NListItem v-for="c in access.data.value.hiddenFrom" :key="c.componentId">
                {{ c.componentTitle }}
                <span class="muted"> · on {{ c.canvasTitle }}</span>
              </NListItem>
            </NList>
            <p v-else class="muted">Nothing hidden on canvases they can open.</p>
          </AdminCard>
        </div>

        <h3 class="page__section">Bulk actions</h3>
        <div class="access__actions">
          <NButton
            :disabled="!access.data.value.shared.length"
            data-testid="revoke-shares"
            @click="confirmRevoke"
          >
            Remove all shares
          </NButton>
          <div class="access__transfer">
            <span v-if="transferTo" data-testid="transfer-all-to">
              To {{ transferTo.displayName }}
              <NButton text size="tiny" @click="transferTo = null">change</NButton>
            </span>
            <UserPicker
              v-else
              :exclude="[access.data.value.user.knoxId]"
              placeholder="Transfer owned canvases to…"
              class="page__picker"
              @pick="(u) => (transferTo = u)"
            />
            <NButton
              :disabled="!transferTo || !access.data.value.owned.length"
              data-testid="transfer-all"
              @click="confirmTransfer"
            >
              Transfer all owned canvases
            </NButton>
          </div>
        </div>
      </template>
    </AdminState>
  </section>
</template>

<style scoped src="./page.css"></style>
<style scoped>
.access__who {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
}

.access__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
}

.access__actions,
.access__transfer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.access__actions {
  gap: 16px;
}
</style>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { NButton, NIcon, NTag } from 'naive-ui'
import { LayoutDashboard, Shield } from '@lucide/vue'
import { useMe } from '@/api/me'
import { APP_NAME } from '@/app/config'
import UserMenu from './UserMenu.vue'

const me = useMe()
const isMockApi = import.meta.env.VITE_API_MOCK === '1'
</script>

<template>
  <header class="top-bar">
    <div class="top-bar__left">
      <slot name="left">
        <RouterLink to="/" class="top-bar__brand">
          <NIcon aria-hidden="true" :size="20"><LayoutDashboard /></NIcon>
          <span>{{ APP_NAME }}</span>
        </RouterLink>
      </slot>
    </div>
    <div class="top-bar__center">
      <slot name="center" />
    </div>
    <div class="top-bar__right">
      <slot name="right" />
      <NTag v-if="isMockApi" size="small" :bordered="false" type="info">mock API</NTag>
      <RouterLink v-if="me.data.value?.isAdmin" v-slot="{ navigate }" to="/admin" custom>
        <NButton quaternary size="small" data-testid="admin-link" @click="navigate">
          <template #icon>
            <NIcon aria-hidden="true"><Shield /></NIcon>
          </template>
          Admin
        </NButton>
      </RouterLink>
      <UserMenu />
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 12px 0 16px;
  background: var(--app-panel-bg);
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.top-bar__left,
.top-bar__right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.top-bar__center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.top-bar__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: var(--app-text);
  text-decoration: none;
}

.top-bar__brand :deep(.n-icon) {
  color: var(--app-primary);
}
</style>

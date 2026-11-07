<script setup lang="ts">
import { computed, h, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { NAvatar, NButton, NDropdown, NIcon, useMessage, type DropdownOption } from 'naive-ui'
import { Database, Monitor, Moon, Sun, UserRound } from '@lucide/vue'
import { useMe } from '@/api/me'
import { DEV_USERS, getDevKnoxId, setDevKnoxId } from '@/api/devIdentity'
import { colorSchemePreference, type ColorSchemePreference } from '@/app/colorScheme'
import { menuLabel } from '@/ui/menuLabel'

const isDev = import.meta.env.DEV
const isMockApi = import.meta.env.VITE_API_MOCK === '1'

const me = useMe()
const router = useRouter()
const queryClient = useQueryClient()
const message = useMessage()

const initials = computed(() => {
  const name = me.data.value?.displayName ?? me.data.value?.knoxId ?? '?'
  return name
    .split(/[\s.]+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
})

function icon(component: Component) {
  return () => h(NIcon, null, { default: () => h(component, { size: 16 }) })
}

const schemes: { key: ColorSchemePreference; label: string; icon: Component }[] = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
]

const options = computed<DropdownOption[]>(() => {
  const user = me.data.value
  const currentDevUser = getDevKnoxId()
  const items: DropdownOption[] = [
    {
      key: 'header',
      type: 'render',
      render: () =>
        h('div', { class: 'user-menu__header' }, [
          h('div', { class: 'user-menu__name' }, user?.displayName ?? 'Unknown user'),
          h(
            'div',
            { class: 'user-menu__id' },
            user ? `${user.knoxId}${user.isAdmin ? ' · admin' : ''}` : '',
          ),
        ]),
    },
    { key: 'd1', type: 'divider' },
    {
      key: 'theme',
      label: 'Theme',
      icon: icon(colorSchemePreference.value === 'dark' ? Moon : Sun),
      children: schemes.map((scheme) => ({
        key: `theme:${scheme.key}`,
        label: menuLabel(scheme.label, { checked: colorSchemePreference.value === scheme.key }),
        icon: icon(scheme.icon),
      })),
    },
  ]
  if (isDev) {
    items.push({
      key: 'dev-user',
      label: 'Switch user (dev)',
      icon: icon(UserRound),
      children: DEV_USERS.map((devUser) => ({
        key: `user:${devUser.knoxId}`,
        label: menuLabel(`${devUser.displayName} · ${devUser.knoxId} (${devUser.note})`, {
          checked: currentDevUser === devUser.knoxId,
        }),
      })),
    })
  }
  if (isMockApi) {
    items.push({ key: 'reset-mock', label: 'Reset mock data', icon: icon(Database) })
  }
  return items
})

async function onSelect(key: string): Promise<void> {
  if (key.startsWith('theme:')) {
    colorSchemePreference.value = key.slice('theme:'.length) as ColorSchemePreference
  } else if (key.startsWith('user:')) {
    setDevKnoxId(key.slice('user:'.length))
    await router.push({ name: 'home' })
    await queryClient.resetQueries()
  } else if (key === 'reset-mock' && import.meta.env.VITE_API_MOCK === '1') {
    const { resetDb } = await import('@/mocks/db')
    resetDb()
    await queryClient.resetQueries()
    message.success('Mock data reset to the seed state')
  }
}
</script>

<template>
  <NDropdown trigger="click" placement="bottom-end" :options="options" @select="onSelect">
    <NButton quaternary circle aria-label="User menu" data-testid="user-menu">
      <NAvatar round :size="28" class="user-menu__avatar">{{ initials }}</NAvatar>
    </NButton>
  </NDropdown>
</template>

<style>
.user-menu__header {
  padding: 8px 14px 6px;
}

.user-menu__name {
  font-weight: 600;
}

.user-menu__id {
  font-size: 12px;
  color: var(--app-text-muted);
}

.user-menu__avatar {
  background: var(--app-primary);
  color: #fff;
  font-size: 12px;
}
</style>

<script setup lang="ts">
// Admin area (docs/admin.md): navigation on the left, the selected page on the right.
// The route is admin-guarded (router/index.ts); every endpoint checks again.
import { computed, h } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { NMenu, type MenuOption } from 'naive-ui'
import DefaultLayout from '@/app/layout/DefaultLayout.vue'

const route = useRoute()

function link(name: string, label: string): MenuOption {
  return {
    key: name,
    label: () =>
      h(
        RouterLink,
        { to: { name, query: route.query.range ? { range: route.query.range } : {} } },
        () => label,
      ),
  }
}

const options: MenuOption[] = [
  {
    key: 'permissions',
    label: 'Permissions',
    type: 'group',
    children: [
      link('admin-admins', 'Admins'),
      link('admin-canvases', 'Canvases'),
      link('admin-users', 'User access'),
    ],
  },
  {
    key: 'usage',
    label: 'Usage',
    type: 'group',
    children: [
      link('admin-usage', 'Overview'),
      link('admin-datasets', 'Datasets'),
      link('admin-slow', 'Slow queries & errors'),
    ],
  },
  {
    key: 'system',
    label: 'System',
    type: 'group',
    children: [link('admin-health', 'Health'), link('admin-audit', 'Audit log')],
  },
]

const active = computed(() =>
  route.name === 'admin-dataset' ? 'admin-datasets' : String(route.name ?? ''),
)
</script>

<template>
  <DefaultLayout>
    <div class="admin">
      <nav class="admin__nav" aria-label="Admin">
        <h1 class="admin__title">Admin</h1>
        <NMenu :value="active" :options="options" data-testid="admin-nav" />
      </nav>
      <main class="admin__page">
        <RouterView />
      </main>
    </div>
  </DefaultLayout>
</template>

<style scoped>
.admin {
  display: flex;
  height: 100%;
  min-height: 0;
}

.admin__nav {
  width: 220px;
  flex-shrink: 0;
  overflow: auto;
  border-right: 1px solid var(--app-border);
  background: var(--app-panel-bg);
}

.admin__title {
  margin: 16px 20px 4px;
  font-size: 18px;
}

.admin__page {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 20px 24px 40px;
}

@media (width <= 720px) {
  .admin {
    flex-direction: column;
  }

  .admin__nav {
    width: auto;
    max-height: 40vh;
    border-right: 0;
    border-bottom: 1px solid var(--app-border);
  }

  .admin__page {
    padding: 16px;
  }
}
</style>

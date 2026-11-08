import { createRouter, createWebHistory } from 'vue-router'
import { meQuery } from '@/api/me'
import { appName } from '@/app/config'
import { queryClient } from '@/app/queryClient'

declare module 'vue-router' {
  interface RouteMeta {
    /** Only admins may open the route; others are sent to the 403 page. */
    requiresAdmin?: boolean
    title?: string
  }
}

/** The app's router; `base` is the URL path the app is served under. */
export function createAppRouter(base: string = import.meta.env.BASE_URL) {
  const router = createRouter({
    history: createWebHistory(base),
    routes: [
      {
        path: '/',
        name: 'home',
        component: () => import('@/pages/HomePage.vue'),
        meta: { title: 'Canvases' },
      },
      {
        path: '/canvas/:id',
        name: 'canvas',
        component: () => import('@/pages/CanvasEditorPage.vue'),
        props: true,
        meta: { title: 'Canvas' },
      },
      {
        path: '/admin',
        component: () => import('@/pages/AdminPage.vue'),
        meta: { requiresAdmin: true, title: 'Admin' },
        children: [
          { path: '', name: 'admin', redirect: { name: 'admin-usage' } },
          {
            path: 'admins',
            name: 'admin-admins',
            component: () => import('@/pages/admin/AdminsPage.vue'),
            meta: { requiresAdmin: true, title: 'Admins' },
          },
          {
            path: 'canvases',
            name: 'admin-canvases',
            component: () => import('@/pages/admin/CanvasesPage.vue'),
            meta: { requiresAdmin: true, title: 'All canvases' },
          },
          {
            path: 'users',
            name: 'admin-users',
            component: () => import('@/pages/admin/UserAccessPage.vue'),
            meta: { requiresAdmin: true, title: 'User access' },
          },
          {
            path: 'usage',
            name: 'admin-usage',
            component: () => import('@/pages/admin/UsageOverviewPage.vue'),
            meta: { requiresAdmin: true, title: 'Usage' },
          },
          {
            path: 'usage/datasets',
            name: 'admin-datasets',
            component: () => import('@/pages/admin/DatasetsPage.vue'),
            meta: { requiresAdmin: true, title: 'Dataset usage' },
          },
          {
            path: 'usage/datasets/:id',
            name: 'admin-dataset',
            component: () => import('@/pages/admin/DatasetDetailPage.vue'),
            props: true,
            meta: { requiresAdmin: true, title: 'Dataset usage' },
          },
          {
            path: 'usage/slow',
            name: 'admin-slow',
            component: () => import('@/pages/admin/SlowErrorsPage.vue'),
            meta: { requiresAdmin: true, title: 'Slow queries & errors' },
          },
          {
            path: 'health',
            name: 'admin-health',
            component: () => import('@/pages/admin/HealthPage.vue'),
            meta: { requiresAdmin: true, title: 'Health' },
          },
          {
            path: 'audit',
            name: 'admin-audit',
            component: () => import('@/pages/admin/AuditPage.vue'),
            meta: { requiresAdmin: true, title: 'Audit log' },
          },
        ],
      },
      {
        path: '/forbidden',
        name: 'forbidden',
        component: () => import('@/pages/StatusPage.vue'),
        props: { status: 403 },
        meta: { title: 'No access' },
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/pages/StatusPage.vue'),
        props: { status: 404 },
        meta: { title: 'Not found' },
      },
    ],
  })

  router.beforeEach(async (to) => {
    if (!to.meta.requiresAdmin) return true
    try {
      const me = await queryClient.ensureQueryData(meQuery)
      return me.isAdmin ? true : { name: 'forbidden' }
    } catch {
      // Identity lookup failed; let the page render and show its own error state.
      return true
    }
  })

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · ${appName()}` : appName()
  })

  return router
}

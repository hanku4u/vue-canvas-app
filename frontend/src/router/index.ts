import { createRouter, createWebHistory } from 'vue-router'
import { meQuery } from '@/api/me'
import { APP_NAME } from '@/app/config'
import { queryClient } from '@/app/queryClient'

declare module 'vue-router' {
  interface RouteMeta {
    /** Only admins may open the route; others are sent to the 403 page. */
    requiresAdmin?: boolean
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
      name: 'admin',
      component: () => import('@/pages/AdminPage.vue'),
      meta: { requiresAdmin: true, title: 'Admin' },
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
  document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME
})

export default router

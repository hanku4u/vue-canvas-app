<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NEmpty, NIcon, NInput, NSkeleton } from 'naive-ui'
import { Plus, Search } from '@lucide/vue'
import { useCanvasList } from '@/api/canvases'
import type { CanvasSummary } from '@/api/types'
import DefaultLayout from '@/app/layout/DefaultLayout.vue'
import CanvasCard, { type CanvasCardAction } from '@/ui/canvases/CanvasCard.vue'
import CanvasNameDialog from '@/ui/canvases/CanvasNameDialog.vue'
import { useCanvasActions } from '@/ui/canvases/useCanvasActions'
import { describeError } from '@/ui/useApiErrorNotifier'

const router = useRouter()
const actions = useCanvasActions()

// Search is sent to the server, debounced.
const searchInput = ref('')
const search = ref('')
let debounce: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => (search.value = value.trim()), 250)
})

const mine = useCanvasList(() => ({ scope: 'mine', search: search.value }))
const shared = useCanvasList(() => ({ scope: 'shared', search: search.value }))

const sections = computed(() => [
  {
    key: 'mine',
    title: 'My canvases',
    query: mine,
    showOwner: false,
    empty: search.value ? 'No canvases match your search' : 'You have no canvases yet',
  },
  {
    key: 'shared',
    title: 'Shared with me',
    query: shared,
    showOwner: true,
    empty: search.value
      ? 'No shared canvases match your search'
      : 'Nothing has been shared with you yet',
  },
])

function onAction(action: CanvasCardAction, canvas: CanvasSummary): void {
  switch (action) {
    case 'open':
      void router.push({ name: 'canvas', params: { id: canvas.id } })
      break
    case 'rename':
      actions.startRename(canvas)
      break
    case 'duplicate':
      actions.startDuplicate(canvas)
      break
    case 'delete':
      actions.confirmDelete(canvas)
      break
  }
}
</script>

<template>
  <DefaultLayout>
    <div class="home">
      <div class="home__header">
        <h1 class="home__title">Canvases</h1>
        <NInput
          v-model:value="searchInput"
          class="home__search"
          placeholder="Search canvases…"
          clearable
          data-testid="canvas-search"
        >
          <template #prefix>
            <NIcon><Search /></NIcon>
          </template>
        </NInput>
        <NButton type="primary" data-testid="new-canvas" @click="actions.startCreate">
          <template #icon>
            <NIcon><Plus /></NIcon>
          </template>
          New canvas
        </NButton>
      </div>

      <section
        v-for="section in sections"
        :key="section.key"
        class="home__section"
        :data-testid="`section-${section.key}`"
      >
        <h2 class="home__section-title">
          {{ section.title }}
          <span v-if="section.query.data.value" class="home__count">
            {{ section.query.data.value.items.length }}
          </span>
        </h2>

        <div v-if="section.query.isPending.value" class="home__grid">
          <NSkeleton v-for="n in 3" :key="n" height="132px" :sharp="false" />
        </div>
        <NEmpty
          v-else-if="section.query.isError.value"
          :description="`Could not load canvases: ${describeError(section.query.error.value)}`"
        >
          <template #extra>
            <NButton size="small" @click="section.query.refetch()">Retry</NButton>
          </template>
        </NEmpty>
        <NEmpty
          v-else-if="!section.query.data.value?.items.length"
          :description="section.empty"
          class="home__empty"
        >
          <template v-if="section.key === 'mine' && !search" #extra>
            <NButton size="small" @click="actions.startCreate">Create your first canvas</NButton>
          </template>
        </NEmpty>
        <div v-else class="home__grid">
          <CanvasCard
            v-for="canvas in section.query.data.value.items"
            :key="canvas.id"
            :canvas="canvas"
            :show-owner="section.showOwner"
            @action="onAction"
          />
        </div>
      </section>
    </div>

    <CanvasNameDialog
      v-model:show="actions.dialog.show"
      :mode="actions.dialog.mode"
      :initial-title="actions.dialog.initialTitle"
      :initial-description="actions.dialog.initialDescription"
      :loading="actions.dialog.loading"
      @submit="actions.submitDialog"
    />
  </DefaultLayout>
</template>

<style scoped>
.home {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.home__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.home__title {
  flex: 1;
  margin: 0;
  font-size: 22px;
}

.home__search {
  width: min(320px, 100%);
}

.home__section + .home__section {
  margin-top: 32px;
}

.home__section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.home__count {
  font-weight: 400;
  color: var(--app-text-muted);
}

.home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.home__empty {
  padding: 24px 0;
}
</style>

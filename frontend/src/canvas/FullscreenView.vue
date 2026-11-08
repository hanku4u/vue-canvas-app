<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onErrorCaptured, onMounted, ref, watch } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import { CircleQuestionMark, Minimize2, RotateCw } from '@lucide/vue'
import { getDefinition, resolveConfig } from '@/registry/registry'
import type { ComponentConfig } from '@/registry/types'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { useCanvasUiStore } from '@/stores/canvasUi'
import { useComponentDataStore } from '@/stores/componentData'
import { shortAge, useNow } from '@/ui/useNow'

/**
 * One component filling the window (docs/canvas-ux.md, "Full screen"). The canvas stays
 * mounted and untouched underneath, so leaving (Esc, the button) returns to exactly the
 * same viewport and selection; focus goes back to the component's frame.
 */
const store = useCanvasDocStore()
const ui = useCanvasUiStore()
const dataStore = useComponentDataStore()
const now = useNow()

const component = computed(() => (ui.fullscreenId ? store.components[ui.fullscreenId] : undefined))
const definition = computed(() =>
  component.value ? getDefinition(component.value.type) : undefined,
)
const resolved = computed(() =>
  definition.value && component.value ? resolveConfig(definition.value, component.value) : null,
)
const editable = computed(() => store.canEdit && !!component.value?.access.canEdit)
const dataInfo = computed(() => (ui.fullscreenId ? dataStore.byId.get(ui.fullscreenId) : undefined))
const dataAge = computed(() => shortAge(dataInfo.value?.meta?.asOf, now.value))

const crashed = ref<string | null>(null)
onErrorCaptured((error) => {
  crashed.value = error instanceof Error ? error.message : String(error)
  return false
})

const root = ref<HTMLDivElement | null>(null)
let returnFocusTo: string | null = null

function exit(): void {
  returnFocusTo = ui.fullscreenId
  ui.fullscreenId = null
}

// Leave if the component disappears (deleted, or hidden by a remote change).
watch(component, (value) => {
  if (ui.fullscreenId && !value) ui.fullscreenId = null
})

function onConfigUpdate(patch: ComponentConfig): void {
  if (!ui.fullscreenId) return
  const error = store.updateConfig(ui.fullscreenId, patch)
  if (error) console.warn(`Rejected config change: ${error}`)
}

/** Esc leaves, unless something inside (an open dropdown, a dialog) used it first. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.n-modal, .v-binder-follower-content')) return
  // An open select or dropdown menu closes first (only menus actually on screen count;
  // closed ones may linger in the DOM while they fade out).
  const openMenu = [...document.querySelectorAll('.n-base-select-menu, .n-dropdown-menu')].some(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).opacity !== '0',
  )
  if (openMenu) return
  event.preventDefault()
  event.stopPropagation()
  exit()
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown, true)
  await nextTick()
  root.value?.focus()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  if (returnFocusTo) {
    const id = returnFocusTo
    void nextTick(() => document.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus())
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="component"
      ref="root"
      class="fullscreen"
      role="dialog"
      aria-modal="true"
      :aria-label="`${component.title}, full screen`"
      tabindex="-1"
      :data-component="component.id"
      data-testid="fullscreen"
    >
      <header class="fullscreen__header">
        <NIcon aria-hidden="true" :size="18">
          <component :is="definition?.icon ?? CircleQuestionMark" />
        </NIcon>
        <h2 class="fullscreen__title">{{ component.title }}</h2>
        <NButton
          v-if="dataInfo"
          text
          size="small"
          aria-label="Refresh data"
          class="fullscreen__age"
          @click="dataInfo.refresh()"
        >
          <template #icon>
            <NIcon aria-hidden="true"><RotateCw /></NIcon>
          </template>
          {{ dataAge }}
        </NButton>
        <span class="fullscreen__spacer" />
        <span class="fullscreen__hint">Esc to return to the canvas</span>
        <NButton size="small" data-testid="fullscreen-exit" @click="exit">
          <template #icon>
            <NIcon aria-hidden="true"><Minimize2 /></NIcon>
          </template>
          Exit full screen
        </NButton>
      </header>
      <div class="fullscreen__body">
        <div v-if="crashed" class="fullscreen__problem">
          This component failed to render: {{ crashed }}
        </div>
        <component
          :is="definition.view"
          v-else-if="definition && resolved?.ok"
          :component="component"
          :config="resolved.config"
          :editable="editable"
          :active="true"
          @update-config="onConfigUpdate"
        />
        <div v-else class="fullscreen__problem">This component can't be shown.</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  background: var(--app-panel-bg);
  outline: none;
  animation: fullscreen-in 0.12s ease-out;
}

@keyframes fullscreen-in {
  from {
    opacity: 0;
    transform: scale(0.985);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fullscreen {
    animation: none;
  }
}

.fullscreen__header {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.fullscreen__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fullscreen__age {
  font-size: 12px;
}

.fullscreen__spacer {
  flex: 1;
}

.fullscreen__hint {
  font-size: 12px;
  color: var(--app-text-muted);
}

.fullscreen__body {
  flex: 1;
  min-height: 0;
  padding: 8px;
}

.fullscreen__problem {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--app-text-muted);
}

@media (width <= 600px) {
  .fullscreen__hint {
    display: none;
  }
}
</style>

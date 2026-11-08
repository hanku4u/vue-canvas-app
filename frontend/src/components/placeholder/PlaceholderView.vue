<script setup lang="ts">
import type { ComponentViewProps } from '@/registry/types'

const props = defineProps<ComponentViewProps>()

// Dev/test hook: `window.__crashComponents = ['<id>']` makes this view throw, to exercise the
// per-component error boundary (ComponentFrame). Stripped from production builds.
if (import.meta.env.DEV) {
  const crash = (globalThis as { __crashComponents?: string[] }).__crashComponents
  if (crash?.includes(props.component.id)) throw new Error('Simulated render failure')
}
</script>

<template>
  <div class="placeholder">
    <span class="placeholder__type">placeholder</span>
    <span class="placeholder__size">{{ component.w }} × {{ component.h }}</span>
  </div>
</template>

<style scoped>
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 100%;
  color: var(--app-text-muted);
  font-size: 12px;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 10px,
    color-mix(in srgb, var(--app-border) 35%, transparent) 10px 11px
  );
}

.placeholder__type {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
}
</style>

<script setup lang="ts">
import type { ComponentViewProps } from '@/registry/types'

defineProps<ComponentViewProps>()
</script>

<template>
  <div class="placeholder-preview" data-testid="placeholder-preview">
    <span>{{ component.title }}</span>
  </div>
</template>

<style scoped>
.placeholder-preview {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 8px;
  text-align: center;
  font-size: 28px;
  font-weight: 600;
  color: var(--app-text-muted);
  background: color-mix(in srgb, var(--app-border) 30%, transparent);
}
</style>

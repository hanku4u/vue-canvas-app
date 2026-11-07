<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentViewProps } from '@/registry/types'
import { useComponentDataStore } from '@/stores/componentData'
import type { WaferMapConfig } from './schema'

/** Zoomed-out view: the last drawn wafer (first tile), or a label. */
const props = defineProps<ComponentViewProps<WaferMapConfig>>()
const dataStore = useComponentDataStore()
const snapshot = computed(() => dataStore.snapshots.get(props.component.id))
</script>

<template>
  <div class="wafer-preview" data-testid="wafer-preview">
    <img v-if="snapshot" :src="snapshot" alt="" draggable="false" class="wafer-preview__image" />
    <span v-else class="wafer-preview__label">Wafer map</span>
  </div>
</template>

<style scoped>
.wafer-preview {
  display: grid;
  place-items: center;
  height: 100%;
  overflow: hidden;
}

.wafer-preview__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.wafer-preview__label {
  font-size: 26px;
  font-weight: 600;
  color: var(--app-text-muted);
}
</style>

<script setup lang="ts">
/** A headline number (dataviz: a single value is a tile, not a chart). */
defineProps<{ label: string; value: string; hint?: string }>()
</script>

<template>
  <div class="tile" data-testid="stat-tile">
    <span class="tile__label">{{ label }}</span>
    <strong class="tile__value">{{ value }}</strong>
    <span v-if="hint" class="tile__hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-panel-bg);
}

.tile__label,
.tile__hint {
  font-size: 12px;
  color: var(--app-text-muted);
}

.tile__value {
  font-size: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
</style>

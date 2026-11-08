<script setup lang="ts">
/**
 * A plain card with a real heading. (Naive UI's NCard header uses role="heading" without
 * aria-level, which screen readers can't place in the outline.)
 */
defineProps<{ title?: string; size?: string }>()
</script>

<template>
  <section class="card">
    <header v-if="title || $slots.header || $slots['header-extra']" class="card__header">
      <h3 class="card__title">
        <slot name="header">{{ title }}</slot>
      </h3>
      <div v-if="$slots['header-extra']"><slot name="header-extra" /></div>
    </header>
    <div class="card__body"><slot /></div>
  </section>
</template>

<style scoped>
.card {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-panel-bg);
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px 0;
}

.card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.card__body {
  padding: 10px 16px 14px;
}
</style>

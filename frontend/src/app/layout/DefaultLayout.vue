<script setup lang="ts">
import AppTopBar from './AppTopBar.vue'
</script>

<template>
  <div class="layout">
    <AppTopBar>
      <template v-if="$slots['top-left']" #left><slot name="top-left" /></template>
      <template v-if="$slots['top-right']" #right><slot name="top-right" /></template>
    </AppTopBar>
    <main class="layout__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.layout__main {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>

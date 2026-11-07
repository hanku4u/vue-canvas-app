<script setup lang="ts">
import { computed } from 'vue'
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider,
  darkTheme,
} from 'naive-ui'
import { isDark } from '@/app/colorScheme'
import { darkThemeOverrides, lightThemeOverrides } from '@/app/theme'
import ErrorBoundary from '@/app/ErrorBoundary.vue'

const theme = computed(() => (isDark.value ? darkTheme : null))
const themeOverrides = computed(() => (isDark.value ? darkThemeOverrides : lightThemeOverrides))
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides" class="app-root">
    <NNotificationProvider placement="bottom-right">
      <NMessageProvider placement="bottom">
        <NDialogProvider>
          <ErrorBoundary>
            <RouterView />
          </ErrorBoundary>
        </NDialogProvider>
      </NMessageProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-root {
  height: 100%;
}
</style>

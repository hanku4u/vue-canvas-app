<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { EChartsCoreOption } from 'echarts/core'
import { isDark } from '@/app/colorScheme'
import { registerECharts } from '@/components/chart/echarts'
import { chartTokens, type ChartTokens } from '@/ui/vizPalette'

/**
 * ECharts for admin pages, on the canvas chart setup (tree-shaken, same tokens). `build`
 * gets the theme tokens so colors follow light/dark mode.
 */
registerECharts()

const props = defineProps<{
  build: (tokens: ChartTokens) => EChartsCoreOption
  height?: number
  label: string
}>()

const option = computed(() => {
  const tokens = chartTokens(isDark.value)
  return {
    backgroundColor: 'transparent',
    textStyle: { color: tokens.text, fontFamily: 'inherit' },
    animation: false,
    ...props.build(tokens),
  }
})
</script>

<template>
  <figure class="admin-chart" :aria-label="label" data-testid="admin-chart">
    <figcaption class="admin-chart__label">{{ label }}</figcaption>
    <VChart :option="option" autoresize :style="{ height: `${height ?? 220}px` }" />
  </figure>
</template>

<style scoped>
.admin-chart {
  margin: 0;
  padding: 12px 14px 4px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-panel-bg);
}

.admin-chart__label {
  font-size: 13px;
  font-weight: 600;
}
</style>

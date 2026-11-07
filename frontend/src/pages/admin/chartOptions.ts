import type { ChartTokens } from '@/ui/vizPalette'

/** Shared axis/grid styling for admin charts (thin marks, recessive grid). */
export function baseAxes(tokens: ChartTokens, opts: { time?: boolean; yName?: string } = {}) {
  return {
    grid: { left: 48, right: 16, top: 16, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.surface,
      borderColor: tokens.axis,
      textStyle: { color: tokens.text },
    },
    xAxis: {
      type: opts.time ? 'time' : 'category',
      axisLine: { lineStyle: { color: tokens.axis } },
      axisLabel: { color: tokens.textMuted, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: opts.yName,
      nameTextStyle: { color: tokens.textMuted },
      axisLabel: { color: tokens.textMuted },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
  }
}

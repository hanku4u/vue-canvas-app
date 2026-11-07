import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, BoxplotChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components'

let registered = false

/** Register only the ECharts parts the chart component uses (tree-shaken bundle). */
export function registerECharts(): void {
  if (registered) return
  registered = true
  use([
    CanvasRenderer,
    LineChart,
    ScatterChart,
    BarChart,
    BoxplotChart,
    GridComponent,
    LegendComponent,
    TooltipComponent,
    ToolboxComponent,
    DataZoomComponent,
  ])
}

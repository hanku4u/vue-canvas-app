import { defineAsyncComponent, h, type Component } from 'vue'
import { NSpin } from 'naive-ui'

/**
 * A component view loaded on first use, so heavy libraries (AG Grid, ECharts) stay out of
 * the editor's initial bundle and load only when a canvas actually shows that type.
 */
export function lazyView(loader: () => Promise<{ default: Component }>): Component {
  return defineAsyncComponent({
    loader,
    delay: 150,
    loadingComponent: {
      name: 'LazyViewLoading',
      render: () =>
        h('div', { style: 'display:grid;place-items:center;height:100%' }, [
          h(NSpin, { size: 'small' }),
        ]),
    },
  })
}

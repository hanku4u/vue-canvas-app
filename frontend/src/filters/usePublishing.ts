import { watch } from 'vue'
import { useCanvasDocStore } from '@/stores/canvasDoc'
import { useCanvasUiStore } from '@/stores/canvasUi'
import { useFiltersStore } from '@/stores/filters'

interface PublishRule {
  column: string
  dimension: string
}

/**
 * Publishing (docs/canvas-ux.md, Filters): selections inside components — table rows,
 * chart points, wafers — become session filters in the component's scope (its group, or
 * the canvas), per the component's `publish` rules. Mounted once per canvas.
 */
export function usePublishing(): void {
  const doc = useCanvasDocStore()
  const ui = useCanvasUiStore()
  const filters = useFiltersStore()

  function republish(): void {
    for (const component of Object.values(doc.components)) {
      const rules = (component.config.publish as PublishRule[] | undefined) ?? []
      const scope =
        component.groupId && doc.groups[component.groupId] ? component.groupId : 'canvas'
      const rows = ui.rowSelections[component.id] ?? []
      const dims = rules.map((r) => r.dimension)
      // Drop anything published elsewhere (rule removed, component moved to another group).
      filters.clearPublishedBy(component.id, { scope, dims })
      for (const rule of rules) {
        const values = [
          ...new Set(
            rows
              .map((row) => row[rule.column])
              .filter((v) => v !== null && v !== undefined && v !== '')
              .map(String),
          ),
        ]
        filters.publish(component.id, scope, rule.dimension, values.length ? values : null)
      }
    }
    // Components that were deleted.
    for (const entries of [filters.session.canvas, ...Object.values(filters.session.groups)]) {
      for (const [dimension, entry] of Object.entries(entries)) {
        if (entry.source && !doc.components[entry.source]) delete entries[dimension]
      }
    }
  }

  watch(
    () => [
      ui.rowSelections,
      Object.values(doc.components).map((c) => [c.id, c.groupId, c.config.publish]),
    ],
    republish,
    { deep: true, immediate: true },
  )
}

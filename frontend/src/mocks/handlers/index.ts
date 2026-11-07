import { canvasHandlers } from './canvases'
import { dataHandlers } from './data'
import { filterHandlers } from './filters'
import { meHandlers } from './me'

/** All MSW handlers mocking the FastAPI backend (docs/api.md). */
export const handlers = [...meHandlers, ...canvasHandlers, ...dataHandlers, ...filterHandlers]

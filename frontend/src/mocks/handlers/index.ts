import { canvasHandlers } from './canvases'
import { meHandlers } from './me'

/** All MSW handlers mocking the FastAPI backend (docs/api.md). */
export const handlers = [...meHandlers, ...canvasHandlers]

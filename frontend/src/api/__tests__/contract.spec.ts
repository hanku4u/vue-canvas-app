// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ContractValidator } from '../../../contract/validator'
import { handlers } from '@/mocks/handlers'

/**
 * The OpenAPI contract (contract/openapi.yaml) is what the npm package promises backend
 * authors. Keep it whole and in step with the reference mock the UI is tested against.
 */
describe('contract/openapi.yaml', () => {
  const validator = new ContractValidator()

  it('compiles: every schema and $ref is valid', () => {
    expect(validator.compileAll().length).toBeGreaterThan(40)
  })

  it('documents exactly the endpoints the reference mock implements', () => {
    const mock = handlers
      .map((h) => {
        const info = h.info as { method?: string; path?: string }
        return `${String(info.method)} ${String(info.path)
          .replace(/^\/api/, '')
          .replace(/:(\w+)/g, '{$1}')}`
      })
      .sort()
    expect(mock).toEqual(validator.operations().sort())
  })
})

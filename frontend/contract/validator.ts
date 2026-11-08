/**
 * Validates API traffic against contract/openapi.yaml (used by the contract tests). Paths
 * are matched against the spec's templates; request bodies and JSON responses are checked
 * with the schema for that operation and status.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js'
import { parse } from 'yaml'

type Json = Record<string, unknown>

export const SPEC_PATH = fileURLToPath(new URL('./openapi.yaml', import.meta.url))

export function loadSpec(): Json {
  return parse(readFileSync(SPEC_PATH, 'utf8')) as Json
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

export class ContractValidator {
  readonly spec: Json
  private ajv: Ajv2020
  private cache = new Map<string, ValidateFunction>()
  private templates: { template: string; regex: RegExp }[]

  constructor(spec: Json = loadSpec()) {
    this.spec = spec
    this.ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false })
    // The whole document is one schema resource, so "#/components/schemas/X" resolves.
    this.ajv.addSchema({ ...spec, $id: 'spec' })
    this.templates = Object.keys(spec.paths as Json).map((template) => ({
      template,
      regex: new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`),
    }))
  }

  /** Every operation in the spec as "METHOD /path". */
  operations(): string[] {
    const out: string[] = []
    for (const [path, item] of Object.entries(this.spec.paths as Record<string, Json>)) {
      for (const method of METHODS) if (item[method]) out.push(`${method.toUpperCase()} ${path}`)
    }
    return out
  }

  /** Compile every component schema (throws on structural errors). */
  compileAll(): string[] {
    const names = Object.keys((this.spec.components as Json).schemas as Json)
    for (const name of names) this.ajv.getSchema(`spec#/components/schemas/${name}`)
    return names
  }

  /** The spec path template matching a concrete path ("/canvases/abc" → "/canvases/{id}"). */
  match(path: string): string | null {
    return this.templates.find((t) => t.regex.test(path))?.template ?? null
  }

  private deref(node: unknown): Json {
    let current = node as Json
    while (current && typeof current.$ref === 'string') {
      const pointer = (current.$ref as string).replace(/^#\//, '').split('/')
      current = pointer.reduce<unknown>(
        (acc, key) => (acc as Json)[key.replace(/~1/g, '/').replace(/~0/g, '~')],
        this.spec,
      ) as Json
    }
    return current
  }

  private validator(pointer: string): ValidateFunction {
    let fn = this.cache.get(pointer)
    if (!fn) {
      fn = this.ajv.compile({ $ref: `spec#${pointer}` })
      this.cache.set(pointer, fn)
    }
    return fn
  }

  private static escape(key: string): string {
    return key.replace(/~/g, '~0').replace(/\//g, '~1')
  }

  /** Problems with one request/response pair (empty when it conforms). */
  check(exchange: {
    method: string
    path: string
    status: number
    requestBody?: unknown
    responseBody?: unknown
    responseIsJson: boolean
  }): string[] {
    const label = `${exchange.method} ${exchange.path} → ${exchange.status}`
    const template = this.match(exchange.path)
    if (!template) return [`${label}: path not in the spec`]
    const method = exchange.method.toLowerCase()
    const operation = (this.spec.paths as Record<string, Json>)[template]![method] as Json | undefined
    if (!operation) return [`${label}: method not in the spec for ${template}`]
    const problems: string[] = []
    const base = `/paths/${ContractValidator.escape(template)}/${method}`

    if (exchange.requestBody !== undefined && operation.requestBody) {
      const fn = this.validator(`${base}/requestBody/content/application~1json/schema`)
      if (!fn(exchange.requestBody)) {
        problems.push(`${label}: request body: ${this.ajv.errorsText(fn.errors)}`)
      }
    }

    const responses = operation.responses as Json
    const key = String(exchange.status)
    if (!responses[key]) {
      problems.push(`${label}: status ${key} not documented for ${template}`)
      return problems
    }
    const response = this.deref(responses[key])
    const content = response.content as Json | undefined
    if (!content) {
      if (exchange.responseIsJson && exchange.responseBody !== undefined) {
        problems.push(`${label}: a body was returned but none is documented`)
      }
      return problems
    }
    if (!exchange.responseIsJson) return problems // e.g. Arrow streams
    if (!content['application/json']) {
      problems.push(`${label}: JSON returned but not documented`)
      return problems
    }
    // Point at the response schema through the (possibly shared) response object.
    const ref = (responses[key] as Json).$ref as string | undefined
    const pointer = ref
      ? `${ref.replace(/^#/, '')}/content/application~1json/schema`
      : `${base}/responses/${key}/content/application~1json/schema`
    const fn = this.validator(pointer)
    if (!fn(exchange.responseBody)) {
      problems.push(`${label}: response: ${this.ajv.errorsText(fn.errors, { separator: '; ' })}`)
    }
    return problems
  }
}

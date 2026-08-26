/**
 * @file Diff npm's published spec against what `src/npm/` implements. Pure: it
 *   takes the two inventories and returns findings, so both the check and its
 *   tests drive it without touching the network or the filesystem.
 *   Three legs, in descending confidence:
 *
 *   1. UNCOVERED - the spec documents a method+path no helper builds. This is npm
 *      shipping an endpoint we never wrote, and it is unambiguous.
 *   2. UNDOCUMENTED - a helper builds a method+path the spec no longer carries.
 *      Either npm removed it or we invented it; both are worth a look, and
 *      neither is automatically a bug (npm's spec covers less than the registry
 *      serves).
 *   3. FIELD - the spec declares a field name that appears nowhere in the owning
 *      module's declared names. Advisory by default, because a shape difference
 *      is not always an omission; see {@link fieldIsCovered}.
 */

import type { HelperEndpoint, HelperModule } from './helper-ast.mts'
import type { SpecEndpoint, SpecInventory } from './spec-model.mts'

/**
 * The placeholder both sides normalize a path parameter to.
 */
export const PARAM_PLACEHOLDER = '{}'

/**
 * A spec endpoint with no helper behind it.
 */
export interface UncoveredEndpoint {
  readonly method: string
  readonly operationId: string
  readonly path: string
  readonly summary: string
}

/**
 * A helper whose route the spec does not describe.
 */
export interface UndocumentedHelper {
  readonly file: string
  readonly helper: string
  readonly method: string
  readonly path: string
}

/**
 * A spec field our types do not name.
 */
export interface MissingField {
  readonly field: string
  readonly file: string
  readonly helper: string
  readonly kind: 'request' | 'response'
  readonly route: string
}

/**
 * The whole drift verdict.
 */
export interface DriftReport {
  readonly missingFields: readonly MissingField[]
  readonly matchedEndpoints: number
  readonly uncovered: readonly UncoveredEndpoint[]
  readonly undocumented: readonly UndocumentedHelper[]
}

/**
 * The `METHOD normalized/path` key both inventories are compared on.
 */
export function endpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePathTemplate(path)}`
}

/**
 * Whether a spec field is already named by the owning module.
 *
 * Covered when the field's own leaf name is declared, OR when ANY ancestor
 * segment is declared with an open type - a `Record`, an index signature, or
 * `unknown`. The ancestor rule is what keeps the report honest: npm's spec
 * expands `dist.integrity` and `claims.workflow_ref.file`, while our types
 * deliberately carry `dist` and `claims` as open records because the
 * provider-specific children grow without notice. An open record covers its
 * whole subtree, so reporting those descendants would bury the real findings,
 * which are the fields with no open ancestor at all.
 */
export function fieldIsCovered(field: string, module: HelperModule): boolean {
  const segments = splitFieldPath(field)
  const leaf = segments.at(-1)
  if (!leaf) {
    return true
  }
  if (module.declaredNames.has(leaf)) {
    return true
  }
  for (let i = 0, length = segments.length - 1; i < length; i += 1) {
    if (module.openTypedNames.has(segments[i]!)) {
      return true
    }
  }
  return false
}

/**
 * The path with every parameter segment reduced to {@link PARAM_PLACEHOLDER},
 * so npm's `{escapedPackageName}` and our `${encodeRegistryName(name)}` hole
 * compare equal. Literal segments are left alone, so `/-/org/{}/team` stays
 * distinct from `/-/org/{}/{}`.
 */
export function normalizePathTemplate(path: string): string {
  let out = ''
  let index = 0
  while (index < path.length) {
    const open = path.indexOf('{', index)
    if (open === -1) {
      out += path.slice(index)
      break
    }
    const close = path.indexOf('}', open)
    if (close === -1) {
      out += path.slice(index)
      break
    }
    out += `${path.slice(index, open)}${PARAM_PLACEHOLDER}`
    index = close + 1
  }
  return out
}

/**
 * Compare the two inventories.
 */
export function reportDrift(
  spec: SpecInventory,
  modules: readonly HelperModule[],
): DriftReport {
  const helpersByKey = new Map<string, HelperEndpoint>()
  const moduleByFile = new Map<string, HelperModule>()
  for (let i = 0, { length } = modules; i < length; i += 1) {
    const module = modules[i]!
    moduleByFile.set(module.file, module)
    const { endpoints } = module
    for (let j = 0, elen = endpoints.length; j < elen; j += 1) {
      const endpoint = endpoints[j]!
      helpersByKey.set(endpointKey(endpoint.method, endpoint.path), endpoint)
    }
  }

  const specKeys = new Set<string>()
  const missingFields: MissingField[] = []
  const uncovered: UncoveredEndpoint[] = []
  let matchedEndpoints = 0

  const { endpoints } = spec
  for (let i = 0, { length } = endpoints; i < length; i += 1) {
    const endpoint = endpoints[i]!
    const key = endpointKey(endpoint.method, endpoint.path)
    specKeys.add(key)
    const helper = helpersByKey.get(key)
    if (!helper) {
      uncovered.push({
        method: endpoint.method,
        operationId: endpoint.operationId,
        path: endpoint.path,
        summary: endpoint.summary,
      })
      continue
    }
    matchedEndpoints += 1
    const module = moduleByFile.get(helper.file)
    if (module) {
      missingFields.push(...missingFieldsFor(endpoint, helper, module))
    }
  }

  const undocumented: UndocumentedHelper[] = []
  for (const [key, helper] of helpersByKey) {
    if (!specKeys.has(key)) {
      undocumented.push({
        file: helper.file,
        helper: helper.helper,
        method: helper.method,
        path: helper.path,
      })
    }
  }

  return {
    matchedEndpoints,
    missingFields: missingFields.toSorted(compareMissingFields),
    uncovered: uncovered.toSorted(compareUncovered),
    undocumented: undocumented.toSorted(compareUndocumented),
  }
}

/**
 * The spec fields for one matched endpoint that the owning module never names.
 */
export function missingFieldsFor(
  endpoint: SpecEndpoint,
  helper: HelperEndpoint,
  module: HelperModule,
): MissingField[] {
  const route = `${endpoint.method} ${endpoint.path}`
  const out: MissingField[] = []
  const groups: ReadonlyArray<{
    fields: readonly string[]
    kind: 'request' | 'response'
  }> = [
    { fields: endpoint.requestFields, kind: 'request' },
    { fields: endpoint.responseFields, kind: 'response' },
  ]
  for (let i = 0, { length } = groups; i < length; i += 1) {
    const group = groups[i]!
    for (let j = 0, flen = group.fields.length; j < flen; j += 1) {
      const field = group.fields[j]!
      if (fieldIsCovered(field, module)) {
        continue
      }
      out.push({
        field,
        file: module.file,
        helper: helper.helper,
        kind: group.kind,
        route,
      })
    }
  }
  return out
}

/**
 * The segments of a field path, with `[]` array markers dropped and escaped
 * dots restored: `objects[].package.name` is `objects`, `package`, `name`, and
 * `claims.oidc\.circleci\.com/org-id` is `claims`, `oidc.circleci.com/org-id`.
 *
 * Split by hand rather than by regex because a separator dot and an escaped
 * dot inside a name are one character apart, and a lookbehind pattern for that
 * is exactly the write-once-read-never shape the fleet asks authors to avoid.
 */
export function splitFieldPath(field: string): string[] {
  const out: string[] = []
  let current = ''
  for (let i = 0, { length } = field; i < length; i += 1) {
    const char = field[i]!
    if (char === '\\' && field[i + 1] === '.') {
      current += '.'
      i += 1
      continue
    }
    if (char === '.') {
      out.push(current)
      current = ''
      continue
    }
    current += char
  }
  out.push(current)
  const cleaned: string[] = []
  for (let i = 0, { length } = out; i < length; i += 1) {
    const segment = out[i]!.replaceAll('[]', '')
    if (segment) {
      cleaned.push(segment)
    }
  }
  return cleaned
}

/**
 * Order missing fields by route, then kind, then field.
 */
export function compareMissingFields(a: MissingField, b: MissingField): number {
  const left = `${a.route} ${a.kind} ${a.field}`
  const right = `${b.route} ${b.kind} ${b.field}`
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Order uncovered endpoints by route.
 */
export function compareUncovered(
  a: UncoveredEndpoint,
  b: UncoveredEndpoint,
): number {
  const left = `${a.path} ${a.method}`
  const right = `${b.path} ${b.method}`
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Order undocumented helpers by route.
 */
export function compareUndocumented(
  a: UndocumentedHelper,
  b: UndocumentedHelper,
): number {
  const left = `${a.path} ${a.method}`
  const right = `${b.path} ${b.method}`
  return left < right ? -1 : left > right ? 1 : 0
}

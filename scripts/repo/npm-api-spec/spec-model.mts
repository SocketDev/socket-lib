/**
 * @file Fold npm's split OpenAPI source into one endpoint inventory.
 *   npm ships the spec as `api/base.yaml` plus one file per tag under
 *   `api/registry.npmjs.com/`, joined by redocly. Each tag file carries its own
 *   `components:` block, and a `$ref` inside one is either file-local
 *   (`#/components/responses/X`, resolved against the containing file) or
 *   cross-file (`./api/shared-components.yaml#/components/parameters/Y`,
 *   written relative to the spec repo root because that is where redocly runs).
 *   Both spellings are resolved here so the join needs no redocly at all.
 *   The output is a flat inventory: one entry per method+path, with the field
 *   PATHS the spec declares for the request body and for every 2xx response
 *   body. A field path spells nesting with `.` and an array hop with `[]`, so
 *   `objects[].package.name` is one string a diff can compare.
 */

import { parse as parseYaml } from 'yaml'

/**
 * How deep a `$ref` chain or a schema walk may go before it is treated as
 * cyclic. OpenAPI has no depth limit, and a self-referencing schema would
 * otherwise recurse forever.
 */
export const MAX_SCHEMA_DEPTH = 12

/**
 * The HTTP methods an OpenAPI path item may carry. Anything else under a path
 * (`parameters`, `summary`) describes the path, not an operation.
 */
export const HTTP_METHODS: readonly string[] = [
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
]

/**
 * One operation, flattened.
 */
export interface SpecEndpoint {
  readonly method: string
  readonly operationId: string
  readonly path: string
  readonly requestFields: readonly string[]
  readonly responseFields: readonly string[]
  readonly sourceFile: string
  readonly summary: string
}

/**
 * The whole pinned spec, projected to what a drift diff needs.
 */
export interface SpecInventory {
  readonly endpoints: readonly SpecEndpoint[]
  readonly sha: string
  readonly specIntegrity: string
}

/**
 * A parsed spec file set, keyed by its repo-relative path (`api/base.yaml`).
 */
export type SpecDocuments = ReadonlyMap<string, unknown>

/**
 * Every endpoint in `docs`, sorted by path then method so the generated
 * inventory has a stable diff.
 */
export function collectEndpoints(docs: SpecDocuments): SpecEndpoint[] {
  const endpoints: SpecEndpoint[] = []
  const fileNames = [...docs.keys()].toSorted()
  for (let i = 0, { length } = fileNames; i < length; i += 1) {
    const fileName = fileNames[i]!
    const doc = docs.get(fileName)
    const paths = readRecord(doc)?.['paths']
    const pathsRecord = readRecord(paths)
    if (!pathsRecord) {
      continue
    }
    const pathKeys = Object.keys(pathsRecord)
    for (let j = 0, plen = pathKeys.length; j < plen; j += 1) {
      const pathKey = pathKeys[j]!
      const item = readRecord(pathsRecord[pathKey])
      if (!item) {
        continue
      }
      for (let k = 0, mlen = HTTP_METHODS.length; k < mlen; k += 1) {
        const method = HTTP_METHODS[k]!
        const operation = readRecord(item[method])
        if (!operation) {
          continue
        }
        endpoints.push(
          shapeEndpoint(operation, docs, fileName, method, pathKey),
        )
      }
    }
  }
  return endpoints.toSorted(compareEndpoints)
}

/**
 * Order two endpoints by path then method. Exported so the inventory writer and
 * its tests sort identically.
 */
export function compareEndpoints(a: SpecEndpoint, b: SpecEndpoint): number {
  if (a.path !== b.path) {
    return a.path < b.path ? -1 : 1
  }
  return a.method < b.method ? -1 : a.method > b.method ? 1 : 0
}

/**
 * Resolve `$ref` indirection in `node`, following both the file-local and the
 * cross-file spelling. Returns the node unchanged once `depth` is exhausted, so
 * a cyclic schema terminates instead of overflowing the stack.
 */
export function derefNode(
  node: unknown,
  docs: SpecDocuments,
  currentFile: string,
  depth: number = 0,
): unknown {
  if (depth >= MAX_SCHEMA_DEPTH) {
    return node
  }
  if (Array.isArray(node)) {
    return node.map(entry => derefNode(entry, docs, currentFile, depth + 1))
  }
  const record = readRecord(node)
  if (!record) {
    return node
  }
  const ref = record['$ref']
  if (typeof ref === 'string') {
    const target = resolveRef(ref, docs, currentFile)
    if (!target) {
      return node
    }
    return derefNode(target.node, docs, target.file, depth + 1)
  }
  const out: Record<string, unknown> = {}
  const keys = Object.keys(record)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    out[key] = derefNode(record[key], docs, currentFile, depth + 1)
  }
  return out
}

/**
 * Escape the `.` inside a property NAME so it cannot be mistaken for the `.`
 * that separates two levels of nesting.
 *
 * Npm's trust schema really does declare properties called
 * `oidc.circleci.com/org-id`. Without this, that one name reads as three
 * levels, and the diff blames a field nobody wrote.
 */
export function escapeFieldSegment(name: string): string {
  return name.replaceAll('.', '\\.')
}

/**
 * The dotted field paths a JSON schema declares, with `[]` marking an array
 * hop. `allOf` / `oneOf` / `anyOf` branches are all walked and unioned: the
 * question this answers is "what field names can appear", not "which branch
 * applies".
 */
export function extractSchemaFields(
  schema: unknown,
  prefix: string = '',
  depth: number = 0,
): string[] {
  const record = readRecord(schema)
  if (!record || depth >= MAX_SCHEMA_DEPTH) {
    return []
  }
  const out: string[] = []
  const combinators = ['allOf', 'anyOf', 'oneOf']
  for (let i = 0, { length } = combinators; i < length; i += 1) {
    const branches = record[combinators[i]!]
    if (!Array.isArray(branches)) {
      continue
    }
    for (let j = 0, blen = branches.length; j < blen; j += 1) {
      out.push(...extractSchemaFields(branches[j], prefix, depth + 1))
    }
  }
  if (record['items'] !== undefined) {
    out.push(...extractSchemaFields(record['items'], `${prefix}[]`, depth + 1))
  }
  const properties = readRecord(record['properties'])
  if (properties) {
    const names = Object.keys(properties)
    for (let i = 0, { length } = names; i < length; i += 1) {
      const name = names[i]!
      const escaped = escapeFieldSegment(name)
      const fieldPath = prefix ? `${prefix}.${escaped}` : escaped
      out.push(fieldPath)
      out.push(...extractSchemaFields(properties[name], fieldPath, depth + 1))
    }
  }
  return out
}

/**
 * The `inputs[].inputFile` list from `api/merge-config.yaml`, as repo-relative
 * paths under `api/`. This is npm's own statement of what composes the spec, so
 * a new tag file is picked up without editing anything here.
 */
export function mergeConfigInputs(mergeConfigText: string): string[] {
  const parsed = readRecord(parseYaml(mergeConfigText))
  const inputs = parsed?.['inputs']
  if (!Array.isArray(inputs)) {
    return []
  }
  const out: string[] = []
  for (let i = 0, { length } = inputs; i < length; i += 1) {
    const entry = readRecord(inputs[i])
    const file = entry?.['inputFile']
    if (typeof file === 'string' && file) {
      out.push(`api/${file}`)
    }
  }
  return out
}

/**
 * Parse each fetched file's YAML into a document map. A file that fails to
 * parse is dropped rather than thrown on, so one malformed tag file degrades
 * the report instead of killing the run.
 */
export function parseSpecDocuments(
  files: ReadonlyMap<string, string>,
): Map<string, unknown> {
  const docs = new Map<string, unknown>()
  const names = [...files.keys()]
  for (let i = 0, { length } = names; i < length; i += 1) {
    const name = names[i]!
    try {
      docs.set(name, parseYaml(files.get(name)!))
    } catch {
      // A tag file we cannot parse contributes no endpoints; the caller's
      // endpoint count makes the omission visible.
    }
  }
  return docs
}

/**
 * A plain object view of `value`, or undefined when it is not one. Arrays are
 * excluded: every caller here wants a mapping, and an array indexes by number.
 */
export function readRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

/**
 * Follow one `$ref` to the node it names, plus the file that node lives in so a
 * nested file-local `$ref` resolves against the right document.
 */
export function resolveRef(
  ref: string,
  docs: SpecDocuments,
  currentFile: string,
): { file: string; node: unknown } | undefined {
  const hashAt = ref.indexOf('#')
  const filePart = hashAt === -1 ? ref : ref.slice(0, hashAt)
  const pointer = hashAt === -1 ? '' : ref.slice(hashAt + 1)
  const file = filePart ? resolveRefFile(filePart, docs) : currentFile
  if (!file) {
    return undefined
  }
  let node: unknown = docs.get(file)
  const segments = pointer.split('/').filter(Boolean)
  for (let i = 0, { length } = segments; i < length; i += 1) {
    const segment = segments[i]!.replace(/~1/g, '/').replace(/~0/g, '~')
    const record = readRecord(node)
    if (!record || !(segment in record)) {
      return undefined
    }
    node = record[segment]
  }
  return { file, node }
}

/**
 * Match a `$ref`'s file part to a fetched document.
 *
 * Npm writes cross-file refs relative to the SPEC REPO ROOT
 * (`./api/shared-components.yaml`) even from a file two levels down, because
 * redocly runs from that root. Trying the exact key first and a basename match
 * second handles both that spelling and any sibling-relative one npm may adopt
 * later, without guessing at directory depth.
 */
export function resolveRefFile(
  filePart: string,
  docs: SpecDocuments,
): string | undefined {
  const cleaned = filePart.replace(/^\.\//, '')
  if (docs.has(cleaned)) {
    return cleaned
  }
  const wanted = cleaned.slice(cleaned.lastIndexOf('/') + 1)
  const names = [...docs.keys()]
  for (let i = 0, { length } = names; i < length; i += 1) {
    const name = names[i]!
    if (name.slice(name.lastIndexOf('/') + 1) === wanted) {
      return name
    }
  }
  return undefined
}

/**
 * Flatten one operation into a {@link SpecEndpoint}.
 */
export function shapeEndpoint(
  operation: Record<string, unknown>,
  docs: SpecDocuments,
  sourceFile: string,
  method: string,
  pathKey: string,
): SpecEndpoint {
  const resolved = readRecord(derefNode(operation, docs, sourceFile)) ?? {}
  const requestFields = new Set<string>()
  const requestBody = readRecord(resolved['requestBody'])
  const requestContent = readRecord(requestBody?.['content'])
  if (requestContent) {
    const types = Object.keys(requestContent)
    for (let i = 0, { length } = types; i < length; i += 1) {
      const media = readRecord(requestContent[types[i]!])
      for (const field of extractSchemaFields(media?.['schema'])) {
        requestFields.add(field)
      }
    }
  }
  const responseFields = new Set<string>()
  const responses = readRecord(resolved['responses'])
  if (responses) {
    const codes = Object.keys(responses)
    for (let i = 0, { length } = codes; i < length; i += 1) {
      const code = codes[i]!
      if (!code.startsWith('2')) {
        continue
      }
      const content = readRecord(readRecord(responses[code])?.['content'])
      if (!content) {
        continue
      }
      const types = Object.keys(content)
      for (let j = 0, tlen = types.length; j < tlen; j += 1) {
        const media = readRecord(content[types[j]!])
        for (const field of extractSchemaFields(media?.['schema'])) {
          responseFields.add(field)
        }
      }
    }
  }
  const operationId = resolved['operationId']
  const summary = resolved['summary']
  return {
    method: method.toUpperCase(),
    operationId: typeof operationId === 'string' ? operationId : '',
    path: pathKey,
    requestFields: [...requestFields].toSorted(),
    responseFields: [...responseFields].toSorted(),
    sourceFile,
    summary: typeof summary === 'string' ? summary : '',
  }
}

/**
 * @file Read `src/npm/registry/*.mts` as an AST and report what each helper
 *   actually calls.
 *   Parsed, never grepped, per socket/no-source-sniffing: a regex over the text
 *   would decide "which endpoint does this helper hit" from wording, and any
 *   refactor that keeps the behaviour but moves the URL into a local
 *   would flip the verdict silently.
 *   Two things come out of each module. First, one endpoint per exported helper
 *   that builds a registry URL: the URL is a template literal rooted at the
 *   `registry` local, so its quasis give the literal path segments and its
 *   expressions give the parameter holes. Second, the module's declared NAME
 *   SURFACE: every TypeScript property name plus every object-literal key,
 *   which is what a spec field is checked against.
 */

import { createRequire } from 'node:module'

/**
 * A parsed node. Deliberately loose: acorn's TypeScript nodes carry members
 * this file reads by name and nothing here benefits from a full AST typing.
 */
export interface AstNode {
  type: string
  [key: string]: unknown
}

/**
 * The subset of `@ultrathink/acorn.rs.wasm` this module drives.
 */
export interface AcornWasm {
  parse: (source: string, options: Record<string, unknown>) => AstNode
}

/**
 * Matches the parse options the fleet's other AST readers use, so a construct
 * one of them accepts is never rejected here.
 */
export const AST_PARSE_OPTIONS = {
  ecmaVersion: 2026,
  sourceType: 'module',
  typescript: true,
}

/**
 * The identifiers that hold a registry.npmjs.org base URL. A template literal
 * whose FIRST hole is one of these builds a registry path; one that is not is
 * some other string and is skipped.
 *
 * Two spellings exist because the two halves of the client were written apart:
 * the authenticated modules resolve a per-call override into a `registry`
 * local, while the public read modules use a module-level `NPM_REGISTRY`
 * const. Sibling roots such as `NPM_DOWNLOADS_API` and `CDN_JSDELIVR` are
 * deliberately absent - they are different hosts that npm's registry spec does
 * not describe, so matching them would report every one as undocumented.
 */
export const REGISTRY_ROOT_LOCALS: readonly string[] = [
  'NPM_REGISTRY',
  'registry',
]

/**
 * The placeholder a parameter hole becomes in a normalized path, so
 * `${encodeURIComponent(orgName)}` and the spec's `{orgName}` compare equal.
 */
export const PARAM_HOLE = '{}'

/**
 * One endpoint a helper reaches.
 */
export interface HelperEndpoint {
  readonly file: string
  readonly helper: string
  readonly method: string
  readonly path: string
}

/**
 * Everything one module contributes to the drift diff.
 */
export interface HelperModule {
  readonly endpoints: readonly HelperEndpoint[]
  readonly file: string
  /**
   * Property names whose declared type is open - a `Record`, an index
   * signature, or `unknown`. A spec field nested under one of these is covered
   * by construction, so reporting its children as missing would be noise.
   */
  readonly openTypedNames: ReadonlySet<string>
  /**
   * Every name the module declares: interface members, inline type-literal
   * members, and object-literal keys. A spec field is "named" when its leaf
   * appears here.
   */
  readonly declaredNames: ReadonlySet<string>
}

const requireAcorn = createRequire(import.meta.url)

let cachedAcorn: AcornWasm | undefined

/**
 * The WASM parser, loaded once per process.
 */
export function acornWasm(): AcornWasm {
  if (cachedAcorn === undefined) {
    cachedAcorn = requireAcorn('@ultrathink/acorn.rs.wasm') as AcornWasm
  }
  return cachedAcorn
}

/**
 * Every child node of `node`, in no particular order.
 */
export function childNodes(node: AstNode): AstNode[] {
  const out: AstNode[] = []
  const keys = Object.keys(node)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const value = node[keys[i]!]
    if (Array.isArray(value)) {
      for (let j = 0, vlen = value.length; j < vlen; j += 1) {
        if (isAstNode(value[j])) {
          out.push(value[j] as AstNode)
        }
      }
    } else if (isAstNode(value)) {
      out.push(value as AstNode)
    }
  }
  return out
}

/**
 * The string value of a property key, whether written bare, quoted, or as a
 * computed string literal (`body['bypass_2fa']`).
 */
export function keyName(node: AstNode | undefined): string | undefined {
  if (!node) {
    return undefined
  }
  if (node.type === 'Identifier' && typeof node['name'] === 'string') {
    return node['name']
  }
  if (node.type === 'Literal' && typeof node['value'] === 'string') {
    return node['value']
  }
  return undefined
}

/**
 * True when `value` looks like an AST node.
 */
export function isAstNode(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown | undefined }).type === 'string'
  )
}

/**
 * True when a type annotation is OPEN - it admits property names the
 * annotation does not spell. A `Record<...>`, an index signature, or a bare
 * `unknown` all qualify.
 */
export function isOpenTypeAnnotation(node: AstNode | undefined): boolean {
  if (!node) {
    return false
  }
  let open = false
  walkAst(node, current => {
    if (open) {
      return
    }
    if (
      current.type === 'TSIndexSignature' ||
      current.type === 'TSUnknownKeyword'
    ) {
      open = true
      return
    }
    if (current.type === 'TSTypeReference') {
      const name = keyName(current['typeName'] as AstNode | undefined)
      if (name === 'Record') {
        open = true
      }
    }
  })
  return open
}

/**
 * Parse `source`, or undefined when it will not parse. A module we cannot read
 * contributes nothing rather than failing the whole run.
 */
export function parseModule(source: string): AstNode | undefined {
  try {
    return acornWasm().parse(source, AST_PARSE_OPTIONS)
  } catch {
    return undefined
  }
}

/**
 * Read one helper module.
 */
export function readHelperModule(
  file: string,
  source: string,
): HelperModule | undefined {
  const program = parseModule(source)
  if (!program) {
    return undefined
  }
  const declaredNames = new Set<string>()
  const openTypedNames = new Set<string>()
  walkAst(program, node => {
    if (node.type === 'TSPropertySignature') {
      const name = keyName(node['key'] as AstNode | undefined)
      if (name) {
        declaredNames.add(name)
        const annotation = node['typeAnnotation'] as AstNode | undefined
        if (isOpenTypeAnnotation(annotation)) {
          openTypedNames.add(name)
        }
      }
      return
    }
    if (node.type === 'Property') {
      const name = keyName(node['key'] as AstNode | undefined)
      if (name) {
        declaredNames.add(name)
      }
      return
    }
    if (node.type === 'MemberExpression' && node['computed'] === true) {
      const name = keyName(node['property'] as AstNode | undefined)
      if (name) {
        declaredNames.add(name)
      }
    }
  })
  return {
    declaredNames,
    endpoints: readModuleEndpoints(program, file),
    file,
    openTypedNames,
  }
}

/**
 * The endpoints every exported function in `program` reaches.
 */
export function readModuleEndpoints(
  program: AstNode,
  file: string,
): HelperEndpoint[] {
  const out: HelperEndpoint[] = []
  const body = (program['body'] as AstNode[] | undefined) ?? []
  for (let i = 0, { length } = body; i < length; i += 1) {
    const statement = body[i]!
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? (statement['declaration'] as AstNode | undefined)
        : statement
    if (!declaration || declaration.type !== 'FunctionDeclaration') {
      continue
    }
    const helper = keyName(declaration['id'] as AstNode | undefined)
    if (!helper) {
      continue
    }
    const locals = templateLocals(declaration)
    const method = soleMethodLiteral(declaration)
    const paths = new Set<string>()
    walkAst(declaration, node => {
      if (node.type !== 'TemplateLiteral') {
        return
      }
      const path = registryPathOf(node, locals)
      if (path !== undefined) {
        paths.add(path)
      }
    })
    const sortedPaths = [...paths].toSorted()
    for (let j = 0, plen = sortedPaths.length; j < plen; j += 1) {
      out.push({ file, helper, method, path: sortedPaths[j]! })
    }
  }
  return out
}

/**
 * The registry-relative path a template literal builds, or undefined when it is
 * not rooted at the `registry` local.
 *
 * Every hole becomes {@link PARAM_HOLE} except two: the leading `registry`
 * itself, and a trailing query-string hole, which contributes nothing to the
 * path. `locals` supplies the text of any local const that was itself built
 * from a template literal, so `/-/org/${path}/user` expands rather than
 * collapsing two segments into one hole.
 */
export function registryPathOf(
  node: AstNode,
  locals: ReadonlyMap<string, string>,
): string | undefined {
  const quasis = (node['quasis'] as AstNode[] | undefined) ?? []
  const expressions = (node['expressions'] as AstNode[] | undefined) ?? []
  const first = expressions[0]
  if (
    !first ||
    first.type !== 'Identifier' ||
    typeof first['name'] !== 'string' ||
    !REGISTRY_ROOT_LOCALS.includes(first['name'])
  ) {
    return undefined
  }
  let out = ''
  for (let i = 0, { length } = quasis; i < length; i += 1) {
    out += cookedOf(quasis[i]!)
    const expression = expressions[i]
    if (!expression) {
      continue
    }
    if (i === 0) {
      continue
    }
    out += holeFor(expression, locals)
  }
  return out
}

/**
 * The single `method: '...'` literal inside a function, or `GET` when it has
 * none. Every helper in `src/npm/` issues exactly one request, so a lone
 * literal is unambiguous; a function with two different ones would be a shape
 * this reader does not model, and reporting GET for it would be a lie, so it
 * reports the first in source order and the endpoint diff surfaces the rest.
 */
export function soleMethodLiteral(node: AstNode): string {
  let method: string | undefined
  walkAst(node, current => {
    if (method !== undefined || current.type !== 'Property') {
      return
    }
    if (keyName(current['key'] as AstNode | undefined) !== 'method') {
      return
    }
    const value = current['value'] as AstNode | undefined
    if (value?.type === 'Literal' && typeof value['value'] === 'string') {
      method = value['value']
    }
  })
  return method ?? 'GET'
}

/**
 * The local consts inside a function whose value is a template literal, mapped
 * to the path text they expand to. Used to follow the
 * `const path = \`${enc(org)}/${enc(team)}\`` shape several helpers use.
 */
export function templateLocals(node: AstNode): Map<string, string> {
  const locals = new Map<string, string>()
  walkAst(node, current => {
    if (current.type !== 'VariableDeclarator') {
      return
    }
    const name = keyName(current['id'] as AstNode | undefined)
    const init = current['init'] as AstNode | undefined
    if (!name || init?.type !== 'TemplateLiteral') {
      return
    }
    const quasis = (init['quasis'] as AstNode[] | undefined) ?? []
    const expressions = (init['expressions'] as AstNode[] | undefined) ?? []
    let text = ''
    for (let i = 0, { length } = quasis; i < length; i += 1) {
      text += cookedOf(quasis[i]!)
      if (expressions[i]) {
        text += PARAM_HOLE
      }
    }
    locals.set(name, text)
  })
  return locals
}

/**
 * Visit `node` and every descendant.
 */
export function walkAst(node: AstNode, visit: (node: AstNode) => void): void {
  const stack: AstNode[] = [node]
  while (stack.length) {
    const current = stack.pop()!
    visit(current)
    const children = childNodes(current)
    for (let i = 0, { length } = children; i < length; i += 1) {
      stack.push(children[i]!)
    }
  }
}

/**
 * The literal text of one template chunk.
 */
export function cookedOf(quasi: AstNode): string {
  const value = quasi['value'] as
    | { cooked?: unknown | undefined; raw?: unknown | undefined }
    | undefined
  if (typeof value?.cooked === 'string') {
    return value.cooked
  }
  return typeof value?.raw === 'string' ? value.raw : ''
}

/**
 * What one template hole contributes to a normalized path.
 *
 * A hole naming a local built from a template literal expands to that local's
 * text. A hole naming a query-string local contributes nothing: `?from=0` is
 * not part of the path the spec keys on. Everything else is one parameter.
 */
export function holeFor(
  expression: AstNode,
  locals: ReadonlyMap<string, string>,
): string {
  if (expression.type === 'Identifier') {
    const name = expression['name']
    if (typeof name === 'string') {
      const local = locals.get(name)
      if (local !== undefined) {
        return local
      }
      if (name === 'query' || name === 'suffix') {
        return ''
      }
    }
  }
  return PARAM_HOLE
}

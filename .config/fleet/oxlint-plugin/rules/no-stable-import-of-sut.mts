/**
 * @file In a test file, the actual value under test must come from local
 *   `src/`, never from the `-stable` published-snapshot alias. A `-stable`
 *   binding that appears as the ACTUAL — the argument of the inner
 *   `expect(<actual>)` call — means the test measures the last PUBLISHED build,
 *   not the working tree: local edits are invisible, and a stale snapshot makes
 *   the suite pass against a published API that differs from src.
 *
 *   This is the mirror of `no-src-import-in-test-expect`: that rule forbids a
 *   `src/` binding in the EXPECTED position (which would validate src against
 *   itself); this rule forbids a `-stable` binding in the ACTUAL position. A
 *   `-stable` binding used to BUILD the expected value (`expect(x).toBe(stableFn(...))`)
 *   is the legitimate, intended pattern and is NOT flagged — even when it is a
 *   sibling export of the same module the test covers.
 *
 *   Concrete incidents (socket-lib, 2026-06-03):
 *   - `external-tools/skillspector/resolve.test.mts` imported the actual
 *     `cacheKey` from `@socketsecurity/lib-stable/...` and called it as
 *     `expect(cacheKey(a)).not.toBe(cacheKey(b))`, validating the published
 *     `cacheKey` rather than src.
 *   - `http-request-checksums.test.mts` asserted `expect(isIntegrity(x)).toBe(true)`
 *     with `isIntegrity` from `-stable`; the working tree had widened it from
 *     sha512-only to the full SRI set, so the assertion measured the published
 *     predicate, not src.
 *
 *   Scope: files matching `*.test.*`. A `-stable` binding is flagged only when
 *   it appears as an identifier inside the inner `expect(<actual>)` call's
 *   argument. Report-only — the `-stable` package name varies per repo, so the
 *   rewrite (point the import at the relative `src/` path) is left to the author.
 */

import type { AstNode, RuleContext } from '../lib/rule-types.mts'

const TEST_FILE_RE = /\.test\.(?:[mc]?[jt]s)$/

// `@socketsecurity/<pkg>-stable/<subpath>` — the published-snapshot alias.
const STABLE_IMPORT_RE = /^@[^/]+\/[^/]+-stable\//

// Is this CallExpression the inner `expect(<actual>)` call (callee is the bare
// `expect` identifier)? Its argument is the actual / system-under-test.
function isExpectActualCall(node: AstNode): boolean {
  return (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'expect'
  )
}

// Collect every Identifier name used in a value position within `node`'s
// subtree. Skips non-computed member property names (`.foo`) and object-literal
// keys, which aren't real references to a binding.
function collectValueIdentifiers(node: AstNode, out: Set<string>): void {
  if (!node || typeof node !== 'object') {
    return
  }
  if (Array.isArray(node)) {
    for (let i = 0, { length } = node; i < length; i += 1) {
      collectValueIdentifiers(node[i] as AstNode, out)
    }
    return
  }
  if (typeof node.type !== 'string') {
    return
  }
  if (node.type === 'Identifier') {
    out.add(node.name)
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') {
      continue
    }
    // Skip the property name of a non-computed member access (`obj.foo`).
    if (
      node.type === 'MemberExpression' &&
      key === 'property' &&
      !node.computed
    ) {
      continue
    }
    // Skip object-literal keys (`{ foo: x }` — `foo` isn't a reference).
    if (node.type === 'Property' && key === 'key' && !node.computed) {
      continue
    }
    const child = (node as Record<string, unknown>)[key]
    if (child && typeof child === 'object') {
      collectValueIdentifiers(child as AstNode, out)
    }
  }
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'In tests, the actual value under test must come from local src/, not the -stable published-snapshot alias (else the test validates stale published code, not the working tree).',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      stableActualInExpect:
        '`{{name}}` is imported from the published snapshot (`{{specifier}}`) and used as the ACTUAL inside `expect(...)`. The value under test must come from local `src/` — else the assertion measures the last PUBLISHED build, not your working tree (local edits are invisible; a stale snapshot hides drift). Import it from the relative `src/` path. The `-stable` alias is only for foreign helpers that BUILD the expected value (`expect(actual).toBe(stableFn(...))`).',
    },
    schema: [],
  },

  create(context: RuleContext) {
    const filename = context.filename ?? context.getFilename?.() ?? ''
    if (!TEST_FILE_RE.test(filename)) {
      return {}
    }

    return {
      Program(program: AstNode) {
        // 1. Collect bindings imported from a `-stable` alias specifier.
        const stableBindings = new Map<string, string>()
        const importNodes = new Map<string, AstNode>()
        for (const stmt of program.body) {
          if (
            stmt.type !== 'ImportDeclaration' ||
            stmt.source?.type !== 'Literal'
          ) {
            continue
          }
          const specifier = String(stmt.source.value)
          if (!STABLE_IMPORT_RE.test(specifier)) {
            continue
          }
          for (const spec of stmt.specifiers) {
            if (spec.local?.type === 'Identifier') {
              stableBindings.set(spec.local.name, specifier)
              importNodes.set(spec.local.name, stmt)
            }
          }
        }
        if (stableBindings.size === 0) {
          return
        }

        // 2. Find every inner `expect(<actual>)` call, gather the identifiers
        //    in its argument subtree, and flag any that resolve to a -stable
        //    binding. Report once per binding.
        const flagged = new Set<string>()
        const visit = (node: AstNode): void => {
          if (!node || typeof node !== 'object') {
            return
          }
          if (Array.isArray(node)) {
            for (let i = 0, { length } = node; i < length; i += 1) {
              visit(node[i] as AstNode)
            }
            return
          }
          if (typeof node.type !== 'string') {
            return
          }
          if (isExpectActualCall(node) && Array.isArray(node.arguments)) {
            const used = new Set<string>()
            for (let i = 0, { length } = node.arguments; i < length; i += 1) {
              collectValueIdentifiers(node.arguments[i] as AstNode, used)
            }
            for (const name of used) {
              if (stableBindings.has(name)) {
                flagged.add(name)
              }
            }
          }
          for (const key of Object.keys(node)) {
            if (key === 'parent' || key === 'loc' || key === 'range') {
              continue
            }
            const child = (node as Record<string, unknown>)[key]
            if (child && typeof child === 'object') {
              visit(child as AstNode)
            }
          }
        }
        visit(program)

        for (const name of flagged) {
          context.report({
            node: importNodes.get(name)!,
            messageId: 'stableActualInExpect',
            data: { name, specifier: stableBindings.get(name)! },
          })
        }
      },
    }
  },
}

// oxlint-disable-next-line socket/no-default-export -- oxlint plugin contract requires default-exported rule object.
export default rule

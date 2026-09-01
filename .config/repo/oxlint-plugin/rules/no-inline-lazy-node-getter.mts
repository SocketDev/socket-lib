/**
 * @file Repo-local rule: forbid inline-chained member access on a lazy
 *   node-module getter — `getFs().existsSync(x)`, `getPath().join(a, b)`,
 *   `getNodeChildProcess().spawn(...)`. socket-lib loads Node builtins through
 *   lazy `getNode*()` getters (`src/node/*`) and their short aliases (`getFs`,
 *   `getPath`, …) so a builtin is resolved once and memoized. Calling the
 *   getter inline at every use defeats the memoization read-site ergonomics and
 *   reads noisily — `getFs().existsSync(a) … getFs().statSync(b)` re-invokes
 *   the getter on every line. The fleet convention is to bind it once: const fs
 *   = getFs() if (fs.existsSync(a)) { … } const s = fs.statSync(b) This rule
 *   flags `getX().member` where `getX` is one of the lazy node-module getters
 *   and rewrites it: it hoists `const <name> = getX()` immediately before the
 *   enclosing statement and replaces the inline call with `<name>`. `<name>` is
 *   derived from the getter (`getFs`/`getNodeFs` → `fs`, `getNodePath` →
 *   `path`, `getNodeChildProcess` → `childProcess`). Repo-local (not
 *   fleet-canonical): the `getNode*` lazy-getter convention is socket-lib's own
 *   module shape, so the rule lives under `.config/repo/oxlint-plugin/` and is
 *   wired via `.config/repo/oxlintrc.json`, not cascaded.
 */

import type {
  AstNode,
  RuleContext,
  RuleFixer,
} from '../../../fleet/oxlint-plugin/lib/rule-types.mts'

/**
 * Lazy node-module getter names → the conventional const name to bind them to.
 * Both the canonical `getNode*` form and the short `get*` alias map to the same
 * variable name so the rewrite reads like hand-written code.
 */
const GETTER_TO_BINDING: Record<string, string> = {
  __proto__: null,
  getCrypto: 'crypto',
  getFs: 'fs',
  getFsPromises: 'fsPromises',
  getHttp: 'http',
  getHttps: 'https',
  getNodeAsyncHooks: 'asyncHooks',
  getNodeChildProcess: 'childProcess',
  getNodeCrypto: 'crypto',
  getNodeEvents: 'events',
  getNodeFs: 'fs',
  getNodeFsPromises: 'fsPromises',
  getNodeHttp: 'http',
  getNodeHttps: 'https',
  getNodeModule: 'nodeModule',
  getNodeOs: 'os',
  getNodePath: 'path',
  getNodeProcess: 'nodeProcess',
  getNodeTimersPromises: 'timersPromises',
  getNodeUrl: 'url',
  getNodeUtil: 'util',
  getPath: 'path',
  getSemver: 'semver',
  getUtil: 'util',
} as Record<string, string>

/**
 * Every enclosing scope of a node, innermost first.
 *
 * A hoisted `const` is visible to the whole block it lands in, so a second use
 * anywhere in that block - or in any block nested inside it - must reuse the
 * binding rather than declare its own. Keying only on the enclosing STATEMENT
 * sees two statements in one function as unrelated and emits the declaration
 * twice, which is a redeclaration error rather than a style nit.
 */
export function enclosingScopeKeys(node: AstNode): string[] {
  const keys: string[] = []
  let current: AstNode | undefined = node
  while (current) {
    const { type } = current
    if (
      type === 'BlockStatement' ||
      type === 'Program' ||
      type === 'StaticBlock' ||
      type === 'SwitchStatement'
    ) {
      keys.push(String(current.range?.[0] ?? current.start ?? ''))
    }
    current = current.parent
  }
  return keys
}

/**
 * Walk up from a node to the nearest enclosing statement — the node whose
 * parent is a block / program / switch-case body. The hoisted `const` is
 * inserted before it.
 */
export function findEnclosingStatement(node: AstNode): AstNode | undefined {
  let current = node
  let parent = current.parent
  while (parent) {
    const parentType = parent.type
    if (
      parentType === 'BlockStatement' ||
      parentType === 'Program' ||
      parentType === 'StaticBlock' ||
      parentType === 'SwitchCase'
    ) {
      return current
    }
    current = parent
    parent = current.parent
  }
  return undefined
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Bind a lazy node-module getter to a const once (`const fs = getFs()`) instead of calling it inline at each use (`getFs().existsSync(x)`).',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',
    messages: {
      inlineGetter:
        '`{{getter}}().{{member}}` calls the lazy node-module getter inline. Bind it once — `const {{binding}} = {{getter}}()` — then use `{{binding}}.{{member}}(…)`. Re-invoking the getter at every call site is noisy and defeats the single-read convention.',
    },
    schema: [],
  },

  create(context: RuleContext) {
    const sourceCode = context.getSourceCode
      ? context.getSourceCode()
      : context.sourceCode

    // Dedup hoists within a single lint pass. The first occurrence in a scope
    // hoists and rewrites; every later one only rewrites to the binding that
    // is now in scope.
    //
    // Keyed by SCOPE, not by enclosing statement. A `const` hoisted before one
    // statement is visible to the rest of its block and to every block nested
    // in it, so a statement-keyed set treats two uses in one function as
    // unrelated and emits `const path = getNodePath()` twice - TS2451, not a
    // style nit. Checking each ancestor scope also stops an inner block from
    // shadowing a binding an outer block already declared.
    const hoisted = new Set<string>()

    return {
      // Match `<getter>().<member>` — a MemberExpression whose object is a
      // CallExpression of a bare getter identifier.
      MemberExpression(node: AstNode) {
        const object = node.object
        if (
          !object ||
          object.type !== 'CallExpression' ||
          object.callee?.type !== 'Identifier' ||
          // The getter takes no args; a call with args isn't one of ours.
          (object.arguments && object.arguments.length > 0)
        ) {
          return
        }
        const getter = object.callee.name
        const binding = GETTER_TO_BINDING[getter]
        if (!binding) {
          return
        }
        const member =
          node.property?.type === 'Identifier' ? node.property.name : '…'

        const enclosing = findEnclosingStatement(node)
        const scopeKeys = enclosingScopeKeys(node).map(
          key => `${key}:${binding}`,
        )
        const hoistKey = scopeKeys[0] ?? ''

        context.report({
          node: object,
          messageId: 'inlineGetter',
          data: { getter, member, binding },
          fix(fixer: RuleFixer) {
            // Can't safely hoist without an enclosing statement to anchor to.
            if (!enclosing) {
              return undefined
            }
            // Already bound in this scope or an enclosing one: point this call
            // at that binding instead of declaring a second.
            if (scopeKeys.some(key => hoisted.has(key))) {
              return fixer.replaceText(object, binding)
            }
            hoisted.add(hoistKey)
            const indentMatch = /^[ \t]*/.exec(
              sourceCode.lines?.[enclosing.loc.start.line - 1] ?? '',
            )
            const indent = indentMatch ? indentMatch[0] : ''
            // Anchor the hoist BEFORE any line comment that directly precedes
            // the statement. A leading `// oxlint-disable-next-line …` (or any
            // explanatory comment) targets the statement on the next line;
            // inserting the `const` between the comment and the statement would
            // orphan the directive onto the injected line and re-expose the
            // statement to the disabled rule.
            const commentsBefore =
              sourceCode.getCommentsBefore?.(enclosing) ?? []
            const lastComment = commentsBefore[commentsBefore.length - 1]
            const anchor =
              lastComment &&
              lastComment.loc?.end?.line === enclosing.loc.start.line - 1
                ? lastComment
                : enclosing
            return [
              fixer.insertTextBefore(
                anchor,
                `const ${binding} = ${getter}()\n${indent}`,
              ),
              fixer.replaceText(object, binding),
            ]
          },
        })
      },
    }
  },
}

// oxlint's plugin contract requires a default-exported rule object.
// oxlint-disable-next-line socket/no-default-export -- plugin contract
export default rule

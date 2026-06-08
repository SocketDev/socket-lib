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
  getNodeTimersPromises: 'timersPromises',
  getNodeUrl: 'url',
  getNodeUtil: 'util',
  getPath: 'path',
  getSemver: 'semver',
  getUtil: 'util',
} as Record<string, string>

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
  create(context: RuleContext) {
    const sourceCode = context.getSourceCode
      ? context.getSourceCode()
      : context.sourceCode

    // Dedup hoists within a single lint pass. When one statement holds two
    // inline calls of the SAME getter — `path.basename(x, getNodePath()
    // .extname(x))` next to another `getNodePath()` — emitting the
    // `const path = getNodePath()` hoist for each would write the
    // declaration twice. Key by enclosing-statement range + binding: the
    // first occurrence hoists + rewrites, the rest only rewrite to the
    // already-declared binding.
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
        const hoistKey = enclosing
          ? `${enclosing.range?.[0] ?? enclosing.start ?? enclosing.loc?.start?.line}:${binding}`
          : ''

        context.report({
          node: object,
          messageId: 'inlineGetter',
          data: { getter, member, binding },
          fix(fixer: RuleFixer) {
            // Can't safely hoist without an enclosing statement to anchor to.
            if (!enclosing) {
              return undefined
            }
            // Second+ inline call of the same getter in one statement: the
            // hoist already exists, just point this call at the binding.
            if (hoisted.has(hoistKey)) {
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
}

// oxlint-disable-next-line socket/no-default-export -- oxlint plugin contract requires default-exported rule object.
export default rule

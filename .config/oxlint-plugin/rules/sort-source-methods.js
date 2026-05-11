/**
 * @fileoverview Top-level function declarations should be ordered by
 * visibility group then alphanumerically within each group:
 *
 *   1. Private (un-exported) functions, sorted alphanumerically.
 *   2. Exported functions (`export function ...`), sorted alphanumerically.
 *   3. The script entrypoint (`main()` for runners) is allowed to be
 *      last regardless of name.
 *
 * Rationale: a reader scanning the file should be able to predict
 * where any function lives. Mixed-visibility ordering makes it hard
 * to find the public surface; alphabetical inside each group is
 * cheap, deterministic, and matches the rest of the fleet's sorting
 * conventions (CLAUDE.md "Sorting" rule).
 *
 * Autofix: emits a single fix that re-orders top-level function
 * declarations into canonical order. Function declarations are
 * hoisted, so reordering them is safe for runtime semantics; the
 * leading JSDoc / line-comment block above each declaration travels
 * with the function. The rule only autofixes when every function in
 * the file has a name (anonymous default exports are skipped) and
 * when there are no top-level non-function statements interleaved
 * between functions — interleaved statements can carry side-effects
 * or rely on declaration order, so we don't reshuffle around them.
 */

const SCRIPT_ENTRY_NAMES = new Set(['main'])

function declVisibility(node) {
  // ExportNamedDeclaration wrapping a FunctionDeclaration.
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration &&
    node.declaration.type === 'FunctionDeclaration'
  ) {
    return { visibility: 'export', fn: node.declaration }
  }
  // export default function ...
  if (
    node.type === 'ExportDefaultDeclaration' &&
    node.declaration &&
    node.declaration.type === 'FunctionDeclaration'
  ) {
    return { visibility: 'export', fn: node.declaration }
  }
  if (node.type === 'FunctionDeclaration') {
    return { visibility: 'private', fn: node }
  }
  return undefined
}

/**
 * Compute the sort key for a function entry. Private functions sort
 * before exports; within each group, alphanumerical by name. The
 * script entrypoint (`main`) is pinned to the end regardless of group.
 */
function sortKey(entry) {
  if (entry.isEntrypoint) {
    // Push to the very end. Two characters above the printable range.
    return `��`
  }
  return `${entry.visibility === 'private' ? '0' : '1'}${entry.name}`
}

/**
 * Locate the byte-range start of a function entry, including any
 * leading JSDoc / line-comment block that's contiguous with it (a
 * block separated by a blank line is treated as a free-standing
 * comment and stays put). Falls back to the node's own start when
 * there are no leading comments.
 */
function leadingCommentStart(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore
    ? sourceCode.getCommentsBefore(node)
    : []
  if (!comments || comments.length === 0) {
    return node.range[0]
  }
  // Walk from the last comment back, accepting any comment that's
  // separated from the next one by no more than a single newline
  // (allows a tight stack of `// foo\n// bar\n/** ... */`).
  const tokenText = sourceCode.text
  let earliest = node.range[0]
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i]
    const between = tokenText.slice(c.range[1], earliest)
    // Reject if there's a blank line between this comment and the
    // next block — that means it's a free-standing comment.
    if (/\n\s*\n/.test(between)) {
      break
    }
    earliest = c.range[0]
  }
  return earliest
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Top-level functions sorted by visibility (private→export) and alphanumerically within each group.',
      category: 'Stylistic Issues',
      recommended: true,
    },
    fixable: 'code',
    messages: {
      groupOutOfOrder:
        'Top-level function `{{name}}` ({{visibility}}) appears after a function from the next visibility group. Order: private functions first (alphanumeric), then exported functions (alphanumeric).',
      alphaOutOfOrder:
        'Top-level function `{{name}}` ({{visibility}}) is out of alphanumeric order within its visibility group. Expected to come before `{{prev}}`.',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode
      ? context.getSourceCode()
      : context.sourceCode

    return {
      Program(programNode) {
        // First pass: collect entries + detect violations.
        const entries = []
        let lastVisibilityRank = -1
        let lastNameInGroup = null
        let currentVisibility = null
        const violations = []

        for (const node of programNode.body) {
          const info = declVisibility(node)
          if (!info || !info.fn.id || info.fn.id.type !== 'Identifier') {
            continue
          }
          const name = info.fn.id.name
          const isEntrypoint = SCRIPT_ENTRY_NAMES.has(name)
          const start = leadingCommentStart(sourceCode, node)
          entries.push({
            node,
            name,
            visibility: info.visibility,
            isEntrypoint,
            start,
            end: node.range[1],
          })

          if (isEntrypoint) {
            continue
          }

          const rank = info.visibility === 'private' ? 0 : 1

          if (rank < lastVisibilityRank) {
            violations.push({
              node: info.fn.id,
              messageId: 'groupOutOfOrder',
              data: { name, visibility: info.visibility },
            })
            continue
          }
          if (rank !== lastVisibilityRank) {
            currentVisibility = info.visibility
            lastVisibilityRank = rank
            lastNameInGroup = name
            continue
          }
          if (lastNameInGroup !== null && name < lastNameInGroup) {
            violations.push({
              node: info.fn.id,
              messageId: 'alphaOutOfOrder',
              data: {
                name,
                visibility: currentVisibility,
                prev: lastNameInGroup,
              },
            })
          } else {
            lastNameInGroup = name
          }
        }

        if (violations.length === 0) {
          return
        }

        // Build the fix once, applied via the first violation. ESLint
        // dedupes overlapping fixes, so attaching it once is enough.
        const sorted = entries.slice().sort((a, b) => {
          const ka = sortKey(a)
          const kb = sortKey(b)
          if (ka < kb) {
            return -1
          }
          if (ka > kb) {
            return 1
          }
          return 0
        })

        const orderedByPosition = entries
          .slice()
          .sort((a, b) => a.start - b.start)
        const sourceText = sourceCode.text
        const rangeStart = orderedByPosition[0].start
        const rangeEnd = orderedByPosition[orderedByPosition.length - 1].end

        // Bail if any non-function, non-comment statements live between
        // the first and last function — re-ordering would skip over
        // them and lose their side-effects / declaration-order semantics.
        for (const stmt of programNode.body) {
          const isFn = entries.some(e => e.node === stmt)
          if (isFn) {
            continue
          }
          if (stmt.range[0] >= rangeStart && stmt.range[1] <= rangeEnd) {
            // Statement is sandwiched between functions; skip autofix.
            for (const v of violations) {
              context.report(v)
            }
            return
          }
        }

        const sortedTexts = sorted.map(e => sourceText.slice(e.start, e.end))
        const replacement = sortedTexts.join('\n\n')

        // Attach the fix to the first violation only; the rest are
        // reported without a fix so the user sees what's wrong even
        // when applying without --fix.
        let fixerAttached = false
        for (const v of violations) {
          if (!fixerAttached) {
            context.report({
              ...v,
              fix(fixer) {
                return fixer.replaceTextRange(
                  [rangeStart, rangeEnd],
                  replacement,
                )
              },
            })
            fixerAttached = true
          } else {
            context.report(v)
          }
        }
      },
    }
  },
}

export default rule

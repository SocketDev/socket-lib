/*
 * @file Caps how long a single INLINE comment block may run. Per CLAUDE.md
 *   "Default to no comments; when written, for a junior reader" — a comment
 *   earns its place by naming a constraint or a hidden invariant, and past a
 *   point a wall of prose stops being read at all. The long ones in practice
 *   are narration that restates the code beneath, or a design discussion that
 *   belongs in `docs/agents.md/**` where it is searchable and can be linked.
 *
 *   Sized against the windows in `lib/comment-markers.mts`, so they agree
 *   instead of drifting:
 *
 *   - The FILE header gets `MAX_FILE_HEADER_COMMENT_LINES` (20), and that is
 *     the default cap for an INLINE block: it should never out-run the budget
 *     of the whole file's `@file` docblock.
 *   - A DOCUMENTATION block gets `MAX_DOC_COMMENT_LINES` (40). A single
 *     JSDoc `/** *\/` carries API contracts and parser lock-step notes, so
 *     it never needs an allow marker under the budget, and past the budget
 *     the discussion moves to `docs/agents.md/**`.
 *   - A LEADING block sits under `MAX_LEADING_COMMENT_LINES` (12) if it needs
 *     to carry a `socket-lint: allow` marker, since the bypass lookback stops
 *     there. `no-malformed-bypass-marker` reports a marker pushed past it.
 *
 *   The file's own header block is exempt — `max-file-lines` already prices the
 *   whole file, and an `@file` docblock is the sanctioned place for the long
 *   explanation. Reporting only: shortening prose is an authoring call, and the
 *   usual fix is to move the depth into a doc and leave a link.
 *
 *   Bypass: a `socket-lint: allow long-comment-block` marker on the block.
 */

import {
  makeBypassCommentChecker,
  MAX_DOC_COMMENT_LINES,
  MAX_FILE_HEADER_COMMENT_LINES,
} from '../../lib/comment-markers.mts'
import { isLockstepMirror } from '../../lib/lockstep-mirror.mts'
import type { AstNode, RuleContext } from '../../lib/rule-types.mts'

// This rule's own opt-out id — the socket-lint-owned checker builds the regex.
const ALLOW_ID = 'long-comment-block'

export interface CommentBlock {
  readonly startLine: number
  readonly endLine: number
  readonly lines: number
  readonly first: AstNode
  readonly isDoc: boolean
}

/**
 * A documentation block: a single `/** ... *\/` comment whose body opens
 * with `*` — the JSDoc shape. Doc blocks carry API contracts and parser
 * lock-step notes, so they get MAX_DOC_COMMENT_LINES instead of the inline
 * cap and never need an allow marker under it.
 */
export function isDocBlock(comment: AstNode): boolean {
  return (
    comment.type === 'Block' &&
    typeof comment.value === 'string' &&
    comment.value.startsWith('*')
  )
}

/**
 * Group comments into contiguous blocks. Adjacent line comments (`//` on
 * consecutive lines) form one block; a single `/* *\/` comment is already a
 * block of its own however many lines it spans. A blank line between two
 * comments ends the block, matching how a reader sees them.
 */
export function groupCommentBlocks(
  comments: readonly AstNode[],
): CommentBlock[] {
  const sorted = comments
    .filter(c => typeof c?.loc?.start?.line === 'number')
    .toSorted((a: AstNode, b: AstNode) => a.loc.start.line - b.loc.start.line)
  const blocks: CommentBlock[] = []
  let first: AstNode | undefined
  let endLine = 0
  for (let i = 0, { length } = sorted; i < length; i += 1) {
    const c = sorted[i]!
    const start = c.loc.start.line
    const end = c.loc.end?.line ?? start
    if (first && start === endLine + 1) {
      endLine = end
      continue
    }
    if (first) {
      blocks.push({
        startLine: first.loc.start.line,
        endLine,
        lines: endLine - first.loc.start.line + 1,
        first,
        isDoc: isDocBlock(first) && first.loc.end?.line === endLine,
      })
    }
    first = c
    endLine = end
  }
  if (first) {
    blocks.push({
      startLine: first.loc.start.line,
      endLine,
      lines: endLine - first.loc.start.line + 1,
      first,
      isDoc: isDocBlock(first) && first.loc.end?.line === endLine,
    })
  }
  return blocks
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'An inline comment block must not out-run the file-header budget; a JSDoc documentation block gets the doubled doc budget. Long prose belongs in docs/agents.md, linked from a short comment.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      tooLong:
        'Comment block runs {{lines}} lines, over the {{limit}}-line cap — past this a reader skips it. Keep the constraint or invariant here and move the discussion into `docs/agents.md/**`, linked from a one-line pointer.',
      docTooLong:
        'Documentation block runs {{lines}} lines, over the {{limit}}-line doc budget. A doc block never needs an allow marker under the budget; past it, keep the contract here and move the discussion into `docs/agents.md/**`, linked from a one-line pointer.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 5 },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context: RuleContext) {
    // Verbatim upstream mirrors keep upstream's shape.
    if (isLockstepMirror(context)) {
      return {}
    }
    const hasBypassComment = makeBypassCommentChecker(context, ALLOW_ID)
    const sourceCode = context.getSourceCode
      ? context.getSourceCode()
      : context.sourceCode
    const configured = context.options?.[0]?.limit
    const limit =
      typeof configured === 'number' && configured >= 5
        ? configured
        : MAX_FILE_HEADER_COMMENT_LINES
    // The doc budget is never tighter than the inline cap, even when a repo
    // raises `limit` past it.
    const docLimit = Math.max(MAX_DOC_COMMENT_LINES, limit)

    return {
      Program(_node: AstNode) {
        const comments =
          (sourceCode.getAllComments && sourceCode.getAllComments()) || []
        const blocks = groupCommentBlocks(comments)
        for (let i = 0, { length } = blocks; i < length; i += 1) {
          const b = blocks[i]!
          // The file's own header block is the sanctioned long explanation.
          if (b.startLine <= MAX_FILE_HEADER_COMMENT_LINES) {
            continue
          }
          const cap = b.isDoc ? docLimit : limit
          if (b.lines <= cap) {
            continue
          }
          if (hasBypassComment(b.first)) {
            continue
          }
          context.report({
            node: b.first,
            messageId: b.isDoc ? 'docTooLong' : 'tooLong',
            data: { lines: String(b.lines), limit: String(cap) },
          })
        }
      },
    }
  },
}

// oxlint-disable-next-line socket/no-default-export -- oxlint plugin contract requires default-exported rule object.
export default rule

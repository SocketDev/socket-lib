/*
 * @file Generic nested named-block parser for comment-delimited regions.
 *
 *   Markers are HTML-element-like, wrapped in the host file's comment syntax
 *   (`<!-- … -->`, `#`, or `//`). The redundant `BEGIN`/`END` keywords are kept
 *   deliberately — they make the markers stand out when scanning a file:
 *
 *     <!-- BEGIN <fleet-canonical id="standards"> -->   # open tag + attributes
 *       …fleet-managed content…
 *       <!-- BEGIN <fleet-canonical id="extra"> -->     # nested, like HTML
 *       <!-- END </fleet-canonical> -->
 *     <!-- END </fleet-canonical> -->                   # bare close tag
 *
 *     # BEGIN <fleet-canonical id="ignores">
 *     # END </fleet-canonical>
 *
 *     // BEGIN <fleet-canonical>
 *     // END </fleet-canonical>
 *
 *   Grammar:
 *     - The OPEN marker carries an HTML open tag `<tag key="value" bool …>` —
 *       `tag` is a hyphenated kebab name, attributes are zero+ HTML-style pairs
 *       (`key="value"`) or bare boolean attributes (`bool`). The tag + its
 *       attributes are parsed by `html5parser` (a zero-dependency HTML parser),
 *       so attribute quoting / boolean attrs behave exactly like HTML.
 *       Attributes are PARSED but not yet consumed by any caller (a disabled
 *       seam — wired in, gated off); a future cascade feature can read them
 *       without a grammar change.
 *     - The CLOSE marker is a bare close tag `</tag>` — no attributes.
 *     - Blocks NEST and must be BALANCED by tag name, like HTML elements.
 *       html5parser is lenient (it never errors on bad nesting), so the
 *       "nested-but-not-malformed → reject" rule is enforced HERE by a
 *       stack walk over the marker sequence: overlap (`BEGIN a … BEGIN b …
 *       END a`), an unclosed `BEGIN`, or an `END` with no open match are
 *       MALFORMED — reported, never auto-fixed.
 *
 *   The fleet cascade manages blocks tagged `fleet-canonical`. This is the
 *   single shared primitive every fleet-block matcher/fixer builds on, so the
 *   marker grammar can't drift between them.
 */

import { SyntaxKind, parse } from 'html5parser'

import type { INode, ITag } from 'html5parser'

export interface NamedBlock {
  readonly tag: string
  readonly attributes: Readonly<Record<string, string>>
  // 0-based line index of the BEGIN marker.
  readonly beginLine: number
  // 0-based line index of the END marker.
  readonly endLine: number
  // Nesting depth (0 = top level).
  readonly depth: number
  readonly children: readonly NamedBlock[]
}

export type MalformedKind = 'mismatch' | 'orphan-end' | 'unclosed'

export interface Malformed {
  readonly kind: MalformedKind
  readonly tag: string
  // 0-based line index of the offending marker.
  readonly line: number
  readonly message: string
}

export interface ParsedBlocks {
  // Top-level blocks; nested blocks hang off each block's `children`.
  readonly roots: readonly NamedBlock[]
  readonly malformed: readonly Malformed[]
  readonly wellFormed: boolean
}

export interface MarkerLine {
  readonly kind: 'begin' | 'end'
  readonly tag: string
  readonly attributes: Readonly<Record<string, string>>
  // 0-based line index.
  readonly line: number
}

// An OPEN marker line: optional indent, a comment opener (`<!--` / `#`+ / `//`),
// the BEGIN keyword, an HTML open tag `<tag …>` (captured whole, handed to
// html5parser), then an optional `-->` close. Case-insensitive on the keyword.
const OPEN_MARKER_RE =
  /^\s*(?:<!--|#+|\/\/)\s*BEGIN\s+(<[A-Za-z][^>]*>)\s*(?:-->)?\s*$/i
// A CLOSE marker line: the END keyword + a bare close tag `</tag>`.
const CLOSE_MARKER_RE =
  /^\s*(?:<!--|#+|\/\/)\s*END\s+<\/\s*([A-Za-z][A-Za-z0-9-]*)\s*>\s*(?:-->)?\s*$/i

const EMPTY_ATTRS: Readonly<Record<string, string>> = Object.freeze({
  __proto__: null,
} as Record<string, string>)

interface OpenFrame {
  tag: string
  attributes: Readonly<Record<string, string>>
  beginLine: number
  children: NamedBlock[]
}

/**
 * Parse a single HTML open tag (`<tag key="value" bool>`) with html5parser and
 * return its lowercased name + attributes, or `undefined` if no tag is found.
 * Boolean attributes (no `="value"`) map to an empty string.
 */
export function parseOpenTag(
  tagHtml: string,
): { tag: string; attributes: Record<string, string> } | undefined {
  const nodes: INode[] = parse(tagHtml, { setAttributeMap: false })
  for (let i = 0, { length } = nodes; i < length; i += 1) {
    const node = nodes[i]!
    if (node.type !== SyntaxKind.Tag) {
      continue
    }
    const element = node as ITag
    const attributes: Record<string, string> = { __proto__: null } as Record<
      string,
      string
    >
    for (let j = 0, alen = element.attributes.length; j < alen; j += 1) {
      const attr = element.attributes[j]!
      attributes[attr.name.value.toLowerCase()] = attr.value
        ? attr.value.value
        : ''
    }
    return { tag: element.name.toLowerCase(), attributes }
  }
  return undefined
}

/**
 * Scan every line for a BEGIN/END marker, returning them in document order.
 * Open-tag names + attributes come from html5parser; tags are lowercased.
 */
export function scanMarkers(content: string): MarkerLine[] {
  const out: MarkerLine[] = []
  const lines = content.split('\n')
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    const open = OPEN_MARKER_RE.exec(line)
    if (open) {
      const parsed = parseOpenTag(open[1]!)
      if (parsed) {
        out.push({
          kind: 'begin',
          tag: parsed.tag,
          attributes: parsed.attributes,
          line: i,
        })
      }
      continue
    }
    const close = CLOSE_MARKER_RE.exec(line)
    if (close) {
      out.push({
        kind: 'end',
        tag: close[1]!.toLowerCase(),
        attributes: EMPTY_ATTRS,
        line: i,
      })
    }
  }
  return out
}

/**
 * Parse `content` into a tree of balanced named blocks. Reports every
 * malformedness (overlap, unclosed BEGIN, orphan END) instead of throwing, so
 * callers can decide to skip the file and surface a finding.
 */
export function parseNamedBlocks(content: string): ParsedBlocks {
  const markers = scanMarkers(content)
  const malformed: Malformed[] = []
  const roots: NamedBlock[] = []
  const stack: OpenFrame[] = []
  for (let i = 0, { length } = markers; i < length; i += 1) {
    const marker = markers[i]!
    if (marker.kind === 'begin') {
      stack.push({
        tag: marker.tag,
        attributes: marker.attributes,
        beginLine: marker.line,
        children: [],
      })
      continue
    }
    if (stack.length === 0) {
      malformed.push({
        kind: 'orphan-end',
        tag: marker.tag,
        line: marker.line,
        message: `END </${marker.tag}> (line ${marker.line + 1}) has no open BEGIN.`,
      })
      continue
    }
    const top = stack[stack.length - 1]!
    if (top.tag !== marker.tag) {
      malformed.push({
        kind: 'mismatch',
        tag: marker.tag,
        line: marker.line,
        message: `END </${marker.tag}> (line ${marker.line + 1}) does not close the open <${top.tag}> (line ${top.beginLine + 1}); blocks must nest, not overlap.`,
      })
      continue
    }
    stack.pop()
    const block: NamedBlock = {
      tag: top.tag,
      attributes: top.attributes,
      beginLine: top.beginLine,
      endLine: marker.line,
      depth: stack.length,
      children: top.children,
    }
    if (stack.length === 0) {
      roots.push(block)
    } else {
      stack[stack.length - 1]!.children.push(block)
    }
  }
  for (let i = 0, { length } = stack; i < length; i += 1) {
    const frame = stack[i]!
    malformed.push({
      kind: 'unclosed',
      tag: frame.tag,
      line: frame.beginLine,
      message: `BEGIN <${frame.tag}> (line ${frame.beginLine + 1}) is never closed.`,
    })
  }
  return { roots, malformed, wellFormed: malformed.length === 0 }
}

/**
 * Depth-first flatten of a block tree into a single list (parents before
 * children).
 */
export function flattenBlocks(roots: readonly NamedBlock[]): NamedBlock[] {
  const out: NamedBlock[] = []
  const queue: NamedBlock[] = [...roots]
  while (queue.length) {
    const block = queue.shift()!
    out.push(block)
    queue.unshift(...block.children)
  }
  return out
}

/**
 * Find every block with the given tag (case-insensitive), at any nesting depth.
 * Returns an empty list when the content is malformed.
 */
export function findBlocksByTag(content: string, tag: string): NamedBlock[] {
  const parsed = parseNamedBlocks(content)
  if (!parsed.wellFormed) {
    return []
  }
  const wanted = tag.toLowerCase()
  return flattenBlocks(parsed.roots).filter(block => block.tag === wanted)
}

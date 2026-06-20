/**
 * @file Single home for fleet-canonical block detection + extraction. The
 *   `<fleet-canonical>` tag markers (parsed by `named-blocks.mts`) delimit the
 *   cascade-owned region of a hybrid file (CLAUDE.md, .gitignore,
 *   .gitattributes, workflows, …); everything outside the markers is
 *   repo-owned. Only the tag grammar is recognized — no legacy fallback. A
 *   cascade / release drop ships the markers and this detector together in one
 *   atomic unit, so a member never sees new markers without the matching
 *   detector. Every fleet-block matcher / fixer reads its marker knowledge from
 *   here, so the grammar stays single-sourced.
 */

import { findBlocksByTag, scanMarkers } from './named-blocks.mts'

// The tag name the cascade manages.
export const FLEET_CANONICAL_TAG = 'fleet-canonical'

// Comment style of the host file, selecting which marker form generators emit.
export type FleetCommentStyle = 'hash' | 'html' | 'slash'

// Well-formed fleet blocks (named-blocks returns none when the content is
// malformed — overlap / unclosed / orphan-end).
function tagBlocks(content: string): ReturnType<typeof findBlocksByTag> {
  return findBlocksByTag(content, FLEET_CANONICAL_TAG)
}

/**
 * The tag-grammar BEGIN marker for a comment style, e.g.
 * `<!-- BEGIN <fleet-canonical> -->` / `# BEGIN <fleet-canonical>`.
 */
export function fleetBeginMarker(style: FleetCommentStyle): string {
  if (style === 'html') {
    return `<!-- BEGIN <${FLEET_CANONICAL_TAG}> -->`
  }
  if (style === 'slash') {
    return `// BEGIN <${FLEET_CANONICAL_TAG}>`
  }
  return `# BEGIN <${FLEET_CANONICAL_TAG}>`
}

/**
 * The tag-grammar END marker for a comment style — a bare close tag, e.g.
 * `<!-- END </fleet-canonical> -->` / `# END </fleet-canonical>`.
 */
export function fleetEndMarker(style: FleetCommentStyle): string {
  if (style === 'html') {
    return `<!-- END </${FLEET_CANONICAL_TAG}> -->`
  }
  if (style === 'slash') {
    return `// END </${FLEET_CANONICAL_TAG}>`
  }
  return `# END </${FLEET_CANONICAL_TAG}>`
}

/**
 * True when a single line is a fleet-BEGIN marker. `scanMarkers` anchors the
 * match to the whole line, so a prose mention of the marker name elsewhere on a
 * line is never mistaken for a marker.
 */
export function isFleetMarkerBeginLine(line: string): boolean {
  return scanMarkers(line).some(
    m => m.kind === 'begin' && m.tag === FLEET_CANONICAL_TAG,
  )
}

/**
 * True when a single line is a fleet-END marker.
 */
export function isFleetMarkerEndLine(line: string): boolean {
  return scanMarkers(line).some(
    m => m.kind === 'end' && m.tag === FLEET_CANONICAL_TAG,
  )
}

/**
 * True when `text` contains a fleet-BEGIN marker — i.e. the file is (or claims
 * to be) fleet-managed.
 */
export function containsFleetBeginMarker(text: string): boolean {
  return scanMarkers(text).some(
    m => m.kind === 'begin' && m.tag === FLEET_CANONICAL_TAG,
  )
}

/**
 * True when `text` carries a complete, balanced fleet block — a hybrid file
 * whose content outside the markers is repo-owned.
 */
export function textHasFleetBlockMarkers(text: string | undefined): boolean {
  if (text === undefined) {
    return false
  }
  return tagBlocks(text).length > 0
}

/**
 * The fleet block of a CLAUDE.md: the lines from the BEGIN marker up to (not
 * including) the END marker. Returns undefined when the block is absent or
 * malformed.
 */
export function extractFleetBlock(content: string): string | undefined {
  const blocks = tagBlocks(content)
  if (blocks.length === 0) {
    return undefined
  }
  const block = blocks[0]!
  return content.split('\n').slice(block.beginLine, block.endLine).join('\n')
}

/**
 * The per-repo region of a CLAUDE.md: everything after the END marker line (the
 * `🏗️ …-Specific` postamble). A file with no markers at all counts as
 * all-per-repo (the whole file). Returns undefined for a malformed block (a
 * BEGIN with no balanced END) so callers don't double-count the fleet content.
 */
export function extractPerRepo(content: string): string | undefined {
  const blocks = tagBlocks(content)
  if (blocks.length > 0) {
    return content
      .split('\n')
      .slice(blocks[0]!.endLine + 1)
      .join('\n')
  }
  return containsFleetBeginMarker(content) ? undefined : content
}

/**
 * @file Unit tests for the shared fleet-marker detection/extraction helpers.
 *   Only the `<fleet-canonical>` tag grammar is recognized (across comment
 *   styles); a prose mention of the marker name is never treated as a marker.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  containsFleetBeginMarker,
  extractFleetBlock,
  extractPerRepo,
  fleetBeginMarker,
  fleetEndMarker,
  isFleetMarkerBeginLine,
  isFleetMarkerEndLine,
  textHasFleetBlockMarkers,
} from '../fleet-markers.mts'

const TAG_HTML =
  'pre\n<!-- BEGIN <fleet-canonical> -->\nRULES\n<!-- END </fleet-canonical> -->\npost\n'
const TAG_HASH =
  '# BEGIN <fleet-canonical>\nignore-me\n# END </fleet-canonical>\nrepo\n'

test('detects a begin marker across comment styles', () => {
  for (const s of [TAG_HTML, TAG_HASH]) {
    assert.equal(containsFleetBeginMarker(s), true)
  }
  assert.equal(containsFleetBeginMarker('just text'), false)
})

test('detects a complete block across comment styles', () => {
  for (const s of [TAG_HTML, TAG_HASH]) {
    assert.equal(textHasFleetBlockMarkers(s), true)
  }
  assert.equal(textHasFleetBlockMarkers('just text'), false)
  assert.equal(textHasFleetBlockMarkers(undefined), false)
})

test('legacy markers are NOT recognized (no back-compat)', () => {
  const legacy =
    'pre\n<!-- BEGIN FLEET-CANONICAL — sync -->\nR\n<!-- END FLEET-CANONICAL -->\npost\n'
  assert.equal(textHasFleetBlockMarkers(legacy), false)
  assert.equal(containsFleetBeginMarker(legacy), false)
  assert.equal(
    isFleetMarkerBeginLine('<!-- BEGIN FLEET-CANONICAL — sync -->'),
    false,
  )
})

test('extracts the fleet block and per-repo region', () => {
  assert.ok(extractFleetBlock(TAG_HTML)?.includes('RULES'))
  assert.equal(extractPerRepo(TAG_HTML), 'post\n')
  assert.equal(extractPerRepo(TAG_HASH), 'repo\n')
})

test('a markerless file is all-per-repo', () => {
  const plain = '# CLAUDE.md\nonly repo content\n'
  assert.equal(extractFleetBlock(plain), undefined)
  assert.equal(extractPerRepo(plain), plain)
})

test('emits the tag grammar per comment style', () => {
  assert.equal(fleetBeginMarker('html'), '<!-- BEGIN <fleet-canonical> -->')
  assert.equal(fleetEndMarker('html'), '<!-- END </fleet-canonical> -->')
  assert.equal(fleetBeginMarker('hash'), '# BEGIN <fleet-canonical>')
  assert.equal(fleetEndMarker('hash'), '# END </fleet-canonical>')
  assert.equal(fleetBeginMarker('slash'), '// BEGIN <fleet-canonical>')
  assert.equal(fleetEndMarker('slash'), '// END </fleet-canonical>')
})

test('emitted markers round-trip through the line predicates', () => {
  for (const style of ['html', 'hash', 'slash']) {
    assert.equal(isFleetMarkerBeginLine(fleetBeginMarker(style)), true)
    assert.equal(isFleetMarkerEndLine(fleetEndMarker(style)), true)
  }
})

test('a prose mention of the marker name is not treated as a marker', () => {
  // Regression: the predicate must match the whole-line marker, or a doc line
  // that merely NAMES the markers gets treated as a real one — which once let
  // the cascade splice mis-bound the fleet block and duplicate it.
  const prose =
    'Two parts: the `BEGIN/END FLEET-CANONICAL` block — edit only in the template.'
  assert.equal(isFleetMarkerBeginLine(prose), false)
  assert.equal(isFleetMarkerEndLine(prose), false)
  assert.equal(isFleetMarkerBeginLine('### Some section heading'), false)
})

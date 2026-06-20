/**
 * @file Unit tests for the shared named-block parser. Covers the three comment
 *   styles, nesting, attribute parsing (incl. boolean attrs via html5parser),
 *   and malformed-rejection (overlap / unclosed / orphan-end).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  findBlocksByTag,
  flattenBlocks,
  parseNamedBlocks,
  parseOpenTag,
  scanMarkers,
} from '../named-blocks.mts'

test('parses a single block in each comment style', () => {
  for (const [open, close] of [
    ['# BEGIN <fleet-canonical>', '# END </fleet-canonical>'],
    ['// BEGIN <fleet-canonical>', '// END </fleet-canonical>'],
    ['<!-- BEGIN <fleet-canonical> -->', '<!-- END </fleet-canonical> -->'],
  ] as const) {
    const parsed = parseNamedBlocks(`${open}\nbody\n${close}`)
    assert.equal(parsed.wellFormed, true)
    assert.equal(parsed.roots.length, 1)
    assert.equal(parsed.roots[0]!.tag, 'fleet-canonical')
    assert.equal(parsed.roots[0]!.beginLine, 0)
    assert.equal(parsed.roots[0]!.endLine, 2)
  }
})

test('parses attributes including boolean attrs', () => {
  const parsed = parseNamedBlocks(
    '# BEGIN <fleet-canonical id="standards" managed>\n# END </fleet-canonical>',
  )
  assert.deepEqual({ ...parsed.roots[0]!.attributes }, {
    id: 'standards',
    managed: '',
  })
})

test('nests like HTML elements', () => {
  const content = [
    '# BEGIN <fleet-canonical id="outer">',
    '  # BEGIN <fleet-canonical id="inner">',
    '  # END </fleet-canonical>',
    '# END </fleet-canonical>',
  ].join('\n')
  const parsed = parseNamedBlocks(content)
  assert.equal(parsed.wellFormed, true)
  assert.equal(parsed.roots.length, 1)
  assert.equal(parsed.roots[0]!.children.length, 1)
  assert.equal(parsed.roots[0]!.children[0]!.attributes['id'], 'inner')
  assert.equal(parsed.roots[0]!.children[0]!.depth, 1)
  assert.equal(flattenBlocks(parsed.roots).length, 2)
})

test('rejects overlap as malformed (mismatch)', () => {
  const parsed = parseNamedBlocks(
    '# BEGIN <a>\n# BEGIN <b>\n# END </a>\n# END </b>',
  )
  assert.equal(parsed.wellFormed, false)
  assert.equal(parsed.malformed[0]!.kind, 'mismatch')
})

test('rejects an unclosed BEGIN', () => {
  const parsed = parseNamedBlocks('// BEGIN <fleet-canonical>\nbody')
  assert.equal(parsed.wellFormed, false)
  assert.equal(parsed.malformed[0]!.kind, 'unclosed')
})

test('rejects an orphan END', () => {
  const parsed = parseNamedBlocks('# END </fleet-canonical>')
  assert.equal(parsed.wellFormed, false)
  assert.equal(parsed.malformed[0]!.kind, 'orphan-end')
})

test('findBlocksByTag returns empty for malformed content', () => {
  assert.equal(findBlocksByTag('# BEGIN <fleet-canonical>', 'fleet-canonical').length, 0)
})

test('scanMarkers ignores non-marker lines', () => {
  assert.equal(scanMarkers('just text\n# a normal comment\n  some code').length, 0)
})

test('parseOpenTag reads name + attributes from a raw tag', () => {
  const parsed = parseOpenTag('<fleet-canonical id="x" flag>')
  assert.equal(parsed?.tag, 'fleet-canonical')
  assert.deepEqual({ ...parsed?.attributes }, { id: 'x', flag: '' })
})

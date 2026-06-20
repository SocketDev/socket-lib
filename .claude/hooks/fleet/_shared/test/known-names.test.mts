// node --test specs for the shared known-names dictionary + prose scanner.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  AMBIGUOUS_DENYLIST,
  buildKnownNames,
  findBareKnownNames,
} from '../known-names.mts'

const NAMES = new Set(['reqwest', 'rolldown', 'rustls'])

test('flags a bare known name in prose', () => {
  const hits = findBareKnownNames('We use rustls for TLS.', { names: NAMES })
  assert.equal(hits.length, 1)
  assert.equal(hits[0]!.name, 'rustls')
  assert.equal(hits[0]!.line, 1)
})

test('a backticked name is clean', () => {
  assert.equal(
    findBareKnownNames('We use `rustls` for TLS.', { names: NAMES }).length,
    0,
  )
})

test('a name inside a fenced code block is clean', () => {
  const md = 'text\n```\nrustls = "0.1"\n```\nmore'
  assert.equal(findBareKnownNames(md, { names: NAMES }).length, 0)
})

test('a name inside a link target is clean', () => {
  assert.equal(
    findBareKnownNames('See [the docs](https://x/rustls).', {
      names: NAMES,
    }).length,
    0,
  )
})

test('a name as a path segment or mid-token is not flagged', () => {
  assert.equal(
    findBareKnownNames('path/to/rustls/lib and rustls-pemfile', {
      names: NAMES,
    }).length,
    0,
  )
})

test('one hit per name even with repeats', () => {
  const hits = findBareKnownNames('rustls and rustls again', { names: NAMES })
  assert.equal(hits.length, 1)
})

test('an ambiguous-denylist word is excluded from the built dictionary', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'known-'))
  try {
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { go: '1', rolldown: '1' } }),
    )
    const names = buildKnownNames(dir)
    assert.equal(names.has('rolldown'), true)
    assert.equal(names.has('go'), false)
    assert.equal(AMBIGUOUS_DENYLIST.has('go'), true)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('buildKnownNames derives package.json deps + curated extras', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'known2-'))
  try {
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { typescript: '5' } }),
    )
    const names = buildKnownNames(dir)
    assert.equal(names.has('typescript'), true)
    // EXTRA_NAMES are always present even without a manifest entry.
    assert.equal(names.has('rustls'), true)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

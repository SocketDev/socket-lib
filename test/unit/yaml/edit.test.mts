/**
 * @file Unit tests for src/yaml/edit — the EditableYaml surface. Drives the
 *   real `yaml` parser (a devDependency here) through the injected-parser
 *   contract, which is the path a caller actually takes.
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import * as yaml from 'yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { safeDelete } from '../../../src/fs/safe.mjs'
import { EditableYaml } from '../../../src/yaml/edit.mjs'

// The shape that broke three fleet repos: a key owning an indented block
// sequence, with comments above and a neighbour on either side.
const NESTED_BLOCK_SOURCE = `# Leading note, unrelated to the key below.
saveExact: true

# Hold nock until the migration lands.
catalogShadowIgnore:
  # nock 15 breaks the mock suites.
  - 'nock'

resolutionMode: highest
`

describe('EditableYaml', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'editable-yaml-'))
  })

  afterEach(async () => {
    await safeDelete(tmpDir)
  })

  it('removes a key together with the block sequence it owns', () => {
    const doc = EditableYaml.fromString(NESTED_BLOCK_SOURCE, { parser: yaml })

    expect(doc.delete('catalogShadowIgnore')).toBe(true)

    const out = doc.toString()
    // The orphan is what a line-based edit leaves behind.
    expect(out).not.toContain("- 'nock'")
    expect(out).not.toContain('catalogShadowIgnore')
    // The result still parses, which the line-based edit did not.
    expect(() => yaml.parse(out)).not.toThrow()
    // Neighbours survive.
    expect(yaml.parse(out)).toMatchObject({
      resolutionMode: 'highest',
      saveExact: true,
    })
  })

  it('keeps comments and key order on an untouched region', () => {
    const doc = EditableYaml.fromString(NESTED_BLOCK_SOURCE, { parser: yaml })
    doc.delete('catalogShadowIgnore')
    const out = doc.toString()

    expect(out).toContain('# Leading note, unrelated to the key below.')
    expect(out.indexOf('saveExact')).toBeLessThan(out.indexOf('resolutionMode'))
  })

  it('reports false when deleting a key that is not there', () => {
    const doc = EditableYaml.fromString('a: 1\n', { parser: yaml })
    expect(doc.delete('absent')).toBe(false)
  })

  it('reads and writes scalar values', () => {
    const doc = EditableYaml.fromString('a: 1\nb: two\n', { parser: yaml })

    expect(doc.has('a')).toBe(true)
    expect(doc.has('missing')).toBe(false)
    expect(doc.get('b')).toBe('two')

    doc.set('b', 'three')
    expect(doc.get('b')).toBe('three')
    expect(doc.toString()).toContain('b: three')
  })

  it('load then save round-trips a file and reports the write', async () => {
    const file = path.join(tmpDir, 'workspace.yaml')
    await writeFile(file, NESTED_BLOCK_SOURCE, 'utf8')

    const doc = await EditableYaml.load(file, { parser: yaml })
    expect(doc.path).toBe(file)
    doc.delete('catalogShadowIgnore')

    expect(await doc.save()).toBe(true)
    const written = await readFile(file, 'utf8')
    expect(written).not.toContain('catalogShadowIgnore')
    expect(yaml.parse(written)).toMatchObject({ saveExact: true })
  })

  it('skips the write when nothing changed', async () => {
    const file = path.join(tmpDir, 'workspace.yaml')
    await writeFile(file, NESTED_BLOCK_SOURCE, 'utf8')

    const doc = await EditableYaml.load(file, { parser: yaml })
    expect(await doc.save()).toBe(false)
  })

  it('writes an unchanged file when force is set', async () => {
    const file = path.join(tmpDir, 'workspace.yaml')
    await writeFile(file, NESTED_BLOCK_SOURCE, 'utf8')

    const doc = await EditableYaml.load(file, { parser: yaml })
    expect(await doc.save({ force: true })).toBe(true)
  })

  it('refuses to save a document with no file behind it', async () => {
    const doc = EditableYaml.fromString('a: 1\n', { parser: yaml })
    expect(doc.path).toBeUndefined()
    await expect(doc.save()).rejects.toThrow(/no file path/i)
  })

  it('exposes the underlying document for reads it does not wrap', () => {
    const doc = EditableYaml.fromString(NESTED_BLOCK_SOURCE, { parser: yaml })
    expect(doc.document.has('catalogShadowIgnore')).toBe(true)
  })

  it('removes a key owning a nested map, not just a sequence', () => {
    const source = `keep: yes
overrides:
  # hold the old line
  'lru-cache@>=10': '11.5.2'
  'mime-db': '1.54.0'
after: true
`
    const doc = EditableYaml.fromString(source, { parser: yaml })
    expect(doc.delete('overrides')).toBe(true)

    const out = doc.toString()
    expect(out).not.toContain('lru-cache')
    expect(out).not.toContain('hold the old line')
    expect(yaml.parse(out)).toEqual({ after: true, keep: 'yes' })
  })

  it('adds a key that was not present', () => {
    const doc = EditableYaml.fromString('a: 1\n', { parser: yaml })
    expect(doc.has('b')).toBe(false)

    doc.set('b', 2)

    expect(doc.has('b')).toBe(true)
    expect(yaml.parse(doc.toString())).toEqual({ a: 1, b: 2 })
  })

  it('set returns the instance so calls chain', () => {
    const doc = EditableYaml.fromString('a: 1\n', { parser: yaml })
    expect(doc.set('b', 2).set('c', 3)).toBe(doc)
    expect(yaml.parse(doc.toString())).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('keeps a nested value untouched while a sibling changes', () => {
    const source = `catalog:
  # pin held for the migration
  'magic-string': 1.2.1
top: one
`
    const doc = EditableYaml.fromString(source, { parser: yaml })
    doc.set('top', 'two')

    const out = doc.toString()
    // The nested pin and its comment are outside the edit and stay verbatim.
    expect(out).toContain('# pin held for the migration')
    expect(out).toContain("'magic-string': 1.2.1")
    expect(out).toContain('top: two')
  })

  it('writes the file back when it vanished after load', async () => {
    const file = path.join(tmpDir, 'gone.yaml')
    await writeFile(file, 'a: 1\n', 'utf8')
    const doc = await EditableYaml.load(file, { parser: yaml })
    await safeDelete(file)

    doc.set('a', 2)

    expect(await doc.save()).toBe(true)
    expect(yaml.parse(await readFile(file, 'utf8'))).toEqual({ a: 2 })
  })

  it('reads only the first document of a multi-document file', () => {
    // parseDocument stops at the first `---` boundary. Recorded so a caller
    // knows this surface is single-document, rather than finding out on save.
    const doc = EditableYaml.fromString('a: 1\n---\nb: 2\n', { parser: yaml })
    expect(doc.get('a')).toBe(1)
    expect(doc.has('b')).toBe(false)
  })

  it('save with no argument behaves as an unforced save', async () => {
    const file = path.join(tmpDir, 'noargs.yaml')
    await writeFile(file, 'a: 1\n', 'utf8')
    const doc = await EditableYaml.load(file, { parser: yaml })

    // Undefined options must not throw on the internal spread.
    expect(await doc.save(undefined)).toBe(false)
  })

  it('a second save after a write reports no further change', async () => {
    const file = path.join(tmpDir, 'twice.yaml')
    await writeFile(file, 'a: 1\n', 'utf8')
    const doc = await EditableYaml.load(file, { parser: yaml })

    doc.set('a', 2)
    expect(await doc.save()).toBe(true)
    // The cached read-text is refreshed by the first save, so the second is a
    // no-op rather than a repeat write.
    expect(await doc.save()).toBe(false)
  })

  it('drives any parser matching the injected contract', () => {
    // A stub proves the dependency is the narrow YamlParserLike interface,
    // not the yaml package itself.
    const calls: string[] = []
    const stub = {
      parseDocument(source: string) {
        calls.push(source)
        return {
          delete: () => true,
          get: () => 'stubbed',
          has: () => true,
          set: () => {},
          toString: () => 'stub: output\n',
        }
      },
    }
    const doc = EditableYaml.fromString('a: 1\n', { parser: stub })
    expect(calls).toEqual(['a: 1\n'])
    expect(doc.get('anything')).toBe('stubbed')
    expect(doc.toString()).toBe('stub: output\n')
  })
})

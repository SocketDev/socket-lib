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

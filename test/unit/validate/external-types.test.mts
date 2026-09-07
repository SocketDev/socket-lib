import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { afterAll, describe, expect, it } from 'vitest'

import { checkTypeDefinition } from '../../../scripts/repo/validate/external-types.mts'

const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'external-type-results-'))
afterAll(() => safeDeleteSync(fixtureDir, { recursive: true }))

describe('checkTypeDefinition', () => {
  it.each([
    {
      name: 'named',
      file: 'example',
      content: 'export const answer: number',
      issues: 0,
    },
    { name: 'empty', file: 'example', content: '', issues: 0 },
    {
      name: 'ambient',
      file: 'example',
      content: 'declare module "example" {}',
      issues: 2,
    },
    {
      name: 'commonjs',
      file: 'example',
      content: 'export = example',
      issues: 1,
    },
    {
      name: 'comment',
      file: 'example',
      content: '// export const example: number',
      issues: 1,
    },
    {
      name: 'semver-missing',
      file: 'semver',
      content: 'export interface Version {}',
      issues: 5,
    },
    {
      name: 'semver-complete',
      file: 'semver',
      content: ['coerce', 'compare', 'parse', 'valid', 'satisfies']
        .map(name => `export function ${name}(): void`)
        .join('\n'),
      issues: 0,
    },
    {
      name: 'sort-missing',
      file: 'fast-sort',
      content: 'export const example: number',
      issues: 1,
    },
    {
      name: 'sort-complete',
      file: 'fast-sort',
      content: 'export function createNewSortInstance(): void',
      issues: 0,
    },
    {
      name: 'extensions-missing',
      file: 'extensions',
      content: 'export const example: number',
      issues: 1,
    },
    {
      name: 'extensions-complete',
      file: 'extensions',
      content: 'export const packageExtensions: object',
      issues: 0,
    },
  ])('preserves $name validation and isolates its result record', fixture => {
    const dir = path.join(fixtureDir, fixture.name)
    mkdirSync(dir)
    const file = path.join(dir, `${fixture.file}.d.ts`)
    writeFileSync(file, fixture.content)
    const result = checkTypeDefinition(file)
    expect(result.ok).toBe(fixture.issues === 0)
    expect(result.issues).toHaveLength(fixture.issues)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect('constructor' in result).toBe(false)
  })

  it('returns a failed result when the declaration cannot be read', () => {
    const result = checkTypeDefinition(path.join(fixtureDir, 'missing.d.ts'))
    expect(result.ok).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(Object.getPrototypeOf(result)).toBeNull()
  })
})

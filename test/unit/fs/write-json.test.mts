/**
 * @file Unit tests for src/fs/write-json — writeJson and writeJsonSync. Split
 *   out of the historical monolithic test/unit/fs.test.mts to keep each test
 *   file under the fleet's 500-line soft cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { writeJson, writeJsonSync } from '../../../src/fs/write-json'

import { runWithTempDir } from '../util/temp-file-helper'

describe('writeJson', () => {
  it('should write JSON to file', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'output.json')
      const testData = { foo: 'bar', count: 42 }

      await writeJson(testFile, testData)

      const content = await fs.readFile(testFile, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed).toEqual(testData)
    }, 'writeJson-basic-')
  })

  it('should format JSON with default spacing', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'formatted.json')
      const testData = { foo: 'bar' }

      await writeJson(testFile, testData)

      const content = await fs.readFile(testFile, 'utf8')
      expect(content).toContain('  ')
      expect(content).toContain('\n')
    }, 'writeJson-formatted-')
  })

  it('should use custom spacing', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'custom-spacing.json')
      const testData = { foo: 'bar' }

      await writeJson(testFile, testData, { spaces: 4 })

      const content = await fs.readFile(testFile, 'utf8')
      expect(content).toContain('    ')
    }, 'writeJson-custom-spacing-')
  })

  it('should use custom EOL', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'custom-eol.json')
      const testData = { foo: 'bar' }

      await writeJson(testFile, testData, { EOL: '\r\n' })

      const content = await fs.readFile(testFile, 'utf8')
      expect(content).toContain('\r\n')
    }, 'writeJson-eol-')
  })

  it('should add final EOL by default', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'final-eol.json')
      const testData = { foo: 'bar' }

      await writeJson(testFile, testData)

      const content = await fs.readFile(testFile, 'utf8')
      expect(content.endsWith('\n')).toBe(true)
    }, 'writeJson-final-eol-')
  })

  it('should omit final EOL when finalEOL is false', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'no-final-eol.json')
      const testData = { foo: 'bar' }

      await writeJson(testFile, testData, { finalEOL: false })

      const content = await fs.readFile(testFile, 'utf8')
      expect(content.endsWith('\n')).toBe(false)
    }, 'writeJson-no-final-eol-')
  })

  it('should use custom replacer function', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'replacer.json')
      const testData = { foo: 'bar', secret: 'hidden' }

      await writeJson(testFile, testData, {
        replacer: (key, value) => {
          if (key === 'secret') {
            return undefined
          }
          return value
        },
      })

      const content = await fs.readFile(testFile, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed.secret).toBeUndefined()
      expect(parsed.foo).toBe('bar')
    }, 'writeJson-replacer-')
  })
})

describe('writeJsonSync', () => {
  it('should write JSON to file', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'output.json')
      const testData = { foo: 'bar', count: 42 }

      writeJsonSync(testFile, testData)

      const content = await fs.readFile(testFile, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed).toEqual(testData)
    }, 'writeJsonSync-basic-')
  })

  it('should format JSON with default spacing', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'formatted.json')
      const testData = { foo: 'bar' }

      writeJsonSync(testFile, testData)

      const content = await fs.readFile(testFile, 'utf8')
      expect(content).toContain('  ')
      expect(content).toContain('\n')
    }, 'writeJsonSync-formatted-')
  })

  it('should use custom spacing', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'custom-spacing.json')
      const testData = { foo: 'bar' }

      writeJsonSync(testFile, testData, { spaces: 4 })

      const content = await fs.readFile(testFile, 'utf8')
      expect(content).toContain('    ')
    }, 'writeJsonSync-custom-spacing-')
  })

  it('should add final EOL by default', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'final-eol.json')
      const testData = { foo: 'bar' }

      writeJsonSync(testFile, testData)

      const content = await fs.readFile(testFile, 'utf8')
      expect(content.endsWith('\n')).toBe(true)
    }, 'writeJsonSync-final-eol-')
  })

  it('should omit final EOL when finalEOL is false', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'no-final-eol.json')
      const testData = { foo: 'bar' }

      writeJsonSync(testFile, testData, { finalEOL: false })

      const content = await fs.readFile(testFile, 'utf8')
      expect(content.endsWith('\n')).toBe(false)
    }, 'writeJsonSync-no-final-eol-')
  })
})

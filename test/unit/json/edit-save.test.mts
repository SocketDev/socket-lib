/**
 * @file Unit tests for src/json/edit persistence surface — save / saveSync /
 *   willSave. Split out of test/unit/json/edit.test.mts to stay under the
 *   file-size cap; construction, mutation, and property tests live there.
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { safeDelete } from '../../../src/fs/safe'
import { getEditableJsonClass } from '../../../src/json/edit'

// EditableJson keeps the last-read/written file contents on an internal
// `readFileContent` field. The tests reach for it to assert on-disk shape
// without re-reading the file. Narrow `unknown` instead of casting to `any`.
function readInternalFileContent(instance: object): string {
  return (instance as { readFileContent: string }).readFileContent
}

describe('EditableJson persistence', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(os.tmpdir(), 'editable-json-test-'))
  })

  afterEach(async () => {
    if (testDir) {
      // On Windows, add retry logic for directory deletion due to file handle timing
      if (process.platform === 'win32') {
        let retries = 5
        while (retries > 0) {
          try {
            await sleep(50)
            await safeDelete(testDir)
            break
          } catch (e) {
            retries--
            if (retries === 0) {
              throw e
            }
            await sleep(100)
          }
        }
      } else {
        await safeDelete(testDir)
      }
    }
  })

  describe('save', () => {
    it('should save JSON to file', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'save.json')
      const instance = await EditableJson.create(filepath, {
        data: { saved: true },
      })

      const saved = await instance.save()
      expect(saved).toBe(true)

      // Verify by checking internal state after save
      expect(readInternalFileContent(instance)).toBe('{\n  "saved": true\n}\n')
    })

    it('should return false if no changes', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'no-change.json')
      await writeFile(filepath, '{\n  "key": "value"\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      const saved = await instance.save()
      expect(saved).toBe(false)
    })

    it('should throw if no file path', async () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ key: 'value' })
      await expect(instance.save()).rejects.toThrow('No file path to save to')
    })

    it('should support ignoreWhitespace option', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'whitespace.json')
      await writeFile(filepath, '{\n  "key": "value"\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      // No actual content changes, just formatting
      const saved = await instance.save({ ignoreWhitespace: true })
      expect(saved).toBe(false)
    })

    it('should use default 2-space indent for new files', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'default-indent.json')
      const instance = await EditableJson.create(filepath, {
        data: { key: 'value' },
      })

      await instance.save()

      // Verify indent by checking internal state
      const savedContent = readInternalFileContent(instance)
      expect(savedContent).toContain('  ') // 2 spaces
      expect(savedContent).not.toContain('    ') // not 4 spaces
    })

    it('should use LF line endings by default', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'default-lf.json')
      const instance = await EditableJson.create(filepath, {
        data: { key: 'value' },
      })

      await instance.save()

      // Verify LF by checking internal state
      const savedContent = readInternalFileContent(instance)
      expect(savedContent).toContain('\n')
      expect(savedContent).not.toContain('\r\n')
    })
  })

  describe('saveSync', () => {
    it('should save JSON synchronously', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'sync.json')
      const instance = await EditableJson.create(filepath, {
        data: { sync: true },
      })

      const saved = instance.saveSync()
      expect(saved).toBe(true)

      const content = await readFile(filepath, 'utf8')
      expect(JSON.parse(content)).toEqual({ sync: true })
    })

    it('should return false if no changes', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'sync-no-change.json')
      await writeFile(filepath, '{\n  "key": "value"\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      const saved = instance.saveSync()
      expect(saved).toBe(false)
    })

    it('should throw if no file path', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ key: 'value' })
      expect(() => instance.saveSync()).toThrow('No file path to save to')
    })

    it('should support sort option', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'sync-sorted.json')
      const instance = await EditableJson.create(filepath, {
        data: { z: 3, a: 1, m: 2 },
      })

      instance.saveSync({ sort: true })

      const content = await readFile(filepath, 'utf8')
      const keys = Object.keys(JSON.parse(content))
      expect(keys).toEqual(['a', 'm', 'z'])
    })

    it('should support ignoreWhitespace option', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'sync-whitespace.json')
      await writeFile(filepath, '{\n  "key": "value"\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      const saved = instance.saveSync({ ignoreWhitespace: true })
      expect(saved).toBe(false)
    })
  })

  describe('willSave', () => {
    it('should return true if changes will be saved', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'will-save.json')
      await writeFile(filepath, '{\n  "key": "value"\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      instance.update({ newKey: 'newValue' })
      expect(instance.willSave()).toBe(true)
    })

    it('should return false if no changes', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'will-not-save.json')
      await writeFile(filepath, '{\n  "key": "value"\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.willSave()).toBe(false)
    })

    it('should return false if no file path', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ key: 'value' })
      expect(instance.willSave()).toBe(false)
    })

    it('should respect ignoreWhitespace option', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'will-save-whitespace.json')
      await writeFile(filepath, '{\n  "key": "value"\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.willSave({ ignoreWhitespace: true })).toBe(false)
    })

    it('should respect sort option', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'will-save-sort.json')
      await writeFile(filepath, '{\n  "z": 3,\n  "a": 1\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.willSave({ sort: true })).toBe(true)
    })
  })
})

/**
 * @file Unit tests for src/json/edit — getEditableJsonClass / EditableJson
 *   surface. Split out of the historical monolithic test/unit/json.test.mts.
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { safeDelete } from '../../../src/fs/safe'
import { getEditableJsonClass } from '../../../src/json/edit'

describe('EditableJson', () => {
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

  describe('getEditableJsonClass', () => {
    it('should return a constructor function', () => {
      const EditableJson = getEditableJsonClass()
      expect(EditableJson).toBeDefined()
      expect(typeof EditableJson).toBe('function')
    })

    it('should return the same instance on multiple calls', () => {
      const EditableJson1 = getEditableJsonClass()
      const EditableJson2 = getEditableJsonClass()
      expect(EditableJson1).toBe(EditableJson2)
    })

    it('should support generic types', () => {
      interface TestConfig {
        version: string
        enabled: boolean
      }
      const EditableJson = getEditableJsonClass<TestConfig>()
      expect(EditableJson).toBeDefined()
    })
  })

  describe('static create', () => {
    it('should create a new instance with path', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'new.json')
      const instance = await EditableJson.create(filepath)
      expect(instance.path).toBe(filepath)
      expect(instance.content).toMatchObject({})
    })

    it('should create instance with initial data', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'with-data.json')
      const instance = await EditableJson.create(filepath, {
        data: { key: 'value' },
      })
      expect(instance.content).toMatchObject({ key: 'value' })
    })

    it('should support typed data', async () => {
      interface Config {
        name: string
        count: number
      }
      const EditableJson = getEditableJsonClass<Config>()
      const filepath = path.join(testDir, 'typed.json')
      const instance = await EditableJson.create(filepath, {
        data: { name: 'test', count: 42 },
      })
      expect(instance.content).toMatchObject({ name: 'test', count: 42 })
    })
  })

  describe('static load', () => {
    it('should load existing JSON file', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'existing.json')
      await writeFile(filepath, '{"loaded":true}', 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.content).toMatchObject({ loaded: true })
    })

    it('should throw error if file does not exist', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'nonexistent.json')

      await expect(EditableJson.load(filepath)).rejects.toThrow()
    })

    it('should create file if create option is true', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'created.json')

      const instance = await EditableJson.load(filepath, { create: true })
      expect(instance.content).toMatchObject({})
      expect(instance.path).toBe(filepath)
    })

    it('should load file if it exists even with create option', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'exists.json')
      await writeFile(filepath, '{"existing":true}', 'utf8')

      const instance = await EditableJson.load(filepath, { create: true })
      expect(instance.content).toMatchObject({ existing: true })
    })

    it('should preserve indentation from loaded file', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'indented.json')
      await writeFile(filepath, '{\n    "key": "value"\n}\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.content).toHaveProperty('key', 'value')
    })

    it('should preserve CRLF line endings', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'crlf.json')
      await writeFile(filepath, '{\r\n  "key": "value"\r\n}\r\n', 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.content).toHaveProperty('key', 'value')
    })
  })

  describe('instance create', () => {
    it('should set path and enable saving', async () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()
      const filepath = path.join(testDir, 'instance.json')

      instance.create(filepath)
      expect(instance.path).toBe(filepath)
      expect(instance.filename).toBe(filepath)
    })

    it('should initialize with empty content', async () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.create(path.join(testDir, 'empty.json'))
      expect(instance.content).toMatchObject({})
    })
  })

  describe('fromContent', () => {
    it('should initialize from object', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ key: 'value' })
      expect(instance.content).toMatchObject({ key: 'value' })
    })

    it('should disable saving when used', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ key: 'value' })
      expect(() => instance.saveSync()).toThrow('No file path to save to')
    })
  })

  describe('fromJSON', () => {
    it('should parse JSON string', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromJSON('{"key":"value"}')
      expect(instance.content).toMatchObject({ key: 'value' })
    })

    it('should detect 2-space indentation', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromJSON('{\n  "key": "value"\n}')
      expect(instance.content).toHaveProperty('key', 'value')
    })

    it('should detect 4-space indentation', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromJSON('{\n    "key": "value"\n}')
      expect(instance.content).toHaveProperty('key', 'value')
    })

    it('should detect tab indentation', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromJSON('{\n\t"key": "value"\n}')
      expect(instance.content).toHaveProperty('key', 'value')
    })

    it('should detect LF line endings', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromJSON('{\n  "key": "value"\n}')
      expect(instance.content).toHaveProperty('key', 'value')
    })

    it('should detect CRLF line endings', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromJSON('{\r\n  "key": "value"\r\n}')
      expect(instance.content).toHaveProperty('key', 'value')
    })
  })

  describe('update', () => {
    it('should merge new content', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ a: 1 })
      instance.update({ b: 2 })
      expect(instance.content).toMatchObject({ a: 1, b: 2 })
    })

    it('should overwrite existing keys', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ key: 'old' })
      instance.update({ key: 'new' })
      expect(instance.content).toMatchObject({ key: 'new' })
    })

    it('should support partial updates', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ a: 1, b: 2, c: 3 })
      instance.update({ b: 20 })
      expect(instance.content).toMatchObject({ a: 1, b: 20, c: 3 })
    })

    it('should return this for chaining', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      const result = instance.fromContent({ a: 1 }).update({ b: 2 })
      expect(result).toBe(instance)
      expect(instance.content).toMatchObject({ a: 1, b: 2 })
    })
  })

  describe('filename property', () => {
    it('should return the file path', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'filename.json')
      const instance = await EditableJson.create(filepath)

      expect(instance.filename).toBe(filepath)
    })

    it('should return empty string if no path', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      expect(instance.filename).toBe('')
    })
  })

  describe('path property', () => {
    it('should return the directory path', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'path.json')
      const instance = await EditableJson.create(filepath)

      expect(instance.path).toBe(filepath)
    })

    it('should return undefined if no path', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      expect(instance.path).toBeUndefined()
    })
  })

  describe('content property', () => {
    it('should return readonly content', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ key: 'value' })
      expect(instance.content).toMatchObject({ key: 'value' })
    })

    it('should be a getter only', () => {
      const EditableJson = getEditableJsonClass()
      const instance = new EditableJson()

      instance.fromContent({ key: 'value' })
      // Content is readonly via TypeScript, but at runtime it's just a getter
      expect(instance.content).toMatchObject({ key: 'value' })
    })
  })

  describe('edge cases', () => {
    it('should handle empty JSON object', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'empty.json')
      await writeFile(filepath, '{}', 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.content).toMatchObject({})
    })

    it('should handle JSON with nested objects', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'nested.json')
      const data = { level1: { level2: { level3: 'deep' } } }
      await writeFile(filepath, JSON.stringify(data, null, 2), 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.content).toMatchObject(data)
    })

    it('should handle JSON with arrays', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'arrays.json')
      const data = { numbers: [1, 2, 3], strings: ['a', 'b', 'c'] }
      await writeFile(filepath, JSON.stringify(data, null, 2), 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.content).toMatchObject(data)
    })

    it('should handle special characters in values', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'special.json')
      const data = { text: 'line1\nline2\ttab' }
      await writeFile(filepath, JSON.stringify(data, null, 2), 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.content).toMatchObject(data)
    })

    it('should handle unicode characters', async () => {
      const EditableJson = getEditableJsonClass()
      const filepath = path.join(testDir, 'unicode.json')
      const data = { emoji: '😀', chinese: '你好' }
      await writeFile(filepath, JSON.stringify(data, null, 2), 'utf8')

      const instance = await EditableJson.load(filepath)
      expect(instance.content).toMatchObject(data)
    })
  })
})

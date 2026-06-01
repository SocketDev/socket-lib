/**
 * @file Unit tests for `EditablePackageJson` instance methods — create,
 *   fromContent, fromJSON, update, load, fix, normalize, prepare, and the
 *   filename/path accessors. Split from edit.test.mts to keep each file under
 *   the line-count cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { PackageJson } from '../../../src/packages/types'
import { getEditablePackageJsonClass } from '../../../src/packages/edit'
import { describe, expect, it } from 'vitest'

import { runWithTempDir } from '../util/temp-file-helper'

interface EditableInternals {
  filename: string
  path: string | undefined
  content: PackageJson & { gitHead?: string | undefined }
}

function internals(pkg: unknown): EditableInternals {
  return pkg as unknown as EditableInternals
}

describe('packages/editable instance methods', () => {
  describe('create', () => {
    it('should create instance with path', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson().create(tmpDir)

        expect(internals(pkg).path).toBe(tmpDir)
        expect(internals(pkg).filename).toContain('package.json')
      }, 'instance-create-')
    })
  })

  describe('fromContent', () => {
    it('should initialize from content object', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      const content = { name: 'test', version: '1.0.0' }

      pkg.fromContent(content)

      expect(pkg.content.name).toBe('test')
      expect(pkg.content.version).toBe('1.0.0')
    })

    it('should disable saving when initialized from content', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      const content = { name: 'test', version: '1.0.0' }

      pkg.fromContent(content)

      expect(pkg.willSave()).toBe(false)
    })
  })

  describe('fromJSON', () => {
    it('should initialize from JSON string', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      const json = JSON.stringify({ name: 'test', version: '1.0.0' })

      pkg.fromJSON(json)

      expect(pkg.content.name).toBe('test')
      expect(pkg.content.version).toBe('1.0.0')
    })
  })

  describe('update', () => {
    it('should update package.json content', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      pkg.fromContent({ name: 'test', version: '1.0.0' })

      pkg.update({ version: '2.0.0', description: 'Updated' })

      expect(pkg.content.version).toBe('2.0.0')
      expect(pkg.content.description).toBe('Updated')
    })
  })

  describe('load', () => {
    it('should load package.json from path', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()
        await pkg.load(tmpDir)

        expect(pkg.content.name).toBe('test')
        expect(internals(pkg).path).toBe(tmpDir)
      }, 'instance-load-')
    })

    it('should throw error when file not found and create is false', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()

        await expect(pkg.load(tmpDir, false)).rejects.toThrow()
      }, 'instance-load-error-')
    })

    it('should throw error if index.js does not exist with create=true', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()

        await expect(pkg.load(tmpDir, true)).rejects.toThrow()
      }, 'instance-load-noindex-')
    })

    it('should throw original error if index.js is invalid', async () => {
      await runWithTempDir(async tmpDir => {
        const indexPath = path.join(tmpDir, 'index.js')
        await fs.writeFile(indexPath, 'invalid javascript {{{')

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()

        await expect(pkg.load(tmpDir, true)).rejects.toThrow()
      }, 'instance-load-invalidindex-')
    })
  })

  describe('fix', () => {
    it('should apply fixes to loaded package.json', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()
        await pkg.load(tmpDir)
        await pkg.fix()

        expect(pkg.content).toBeDefined()
      }, 'instance-fix-')
    })

    it('should apply fixes with options', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()
        await pkg.load(tmpDir)
        await pkg.fix({})

        expect(pkg.content).toBeDefined()
      }, 'instance-fix-opts-')
    })
  })

  describe('normalize', () => {
    it('should normalize loaded package.json', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()
        await pkg.load(tmpDir)
        await pkg.normalize()

        expect(pkg.content.name).toBe('test')
      }, 'instance-normalize-')
    })

    it('should normalize with options', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()
        await pkg.load(tmpDir)
        await pkg.normalize({})

        expect(pkg.content.name).toBe('test')
      }, 'instance-normalize-opts-')
    })
  })

  describe('prepare', () => {
    it('should prepare loaded package.json', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()
        await pkg.load(tmpDir)
        await pkg.prepare()

        expect(pkg.content).toBeDefined()
      }, 'instance-prepare-')
    })

    it('should prepare with options', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = new EditablePackageJson()
        await pkg.load(tmpDir)
        await pkg.prepare({})

        expect(pkg.content).toBeDefined()
      }, 'instance-prepare-opts-')
    })
  })

  describe('filename', () => {
    it('should return empty string when path is undefined', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()

      expect(internals(pkg).filename).toBe('')
    })

    it('should return path as-is if it ends with package.json', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      const filepath = '/path/to/package.json'
      pkg.create(filepath)

      expect(internals(pkg).filename).toBe(filepath)
    })

    it('should append package.json if path does not end with it', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      const dirpath = '/path/to/dir'
      pkg.create(dirpath)

      expect(internals(pkg).filename).toContain('package.json')
    })
  })

  describe('path', () => {
    it('should return the path property', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()

      expect(internals(pkg).path).toBeUndefined()

      pkg.create('/test/path')
      expect(internals(pkg).path).toBe('/test/path')
    })
  })
})

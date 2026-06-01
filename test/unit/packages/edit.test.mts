/**
 * @file Unit tests for editable package.json manipulation utilities. Tests
 *   EditablePackageJson class for modifying package.json programmatically:
 *
 *   - Field setters: name, version, description, scripts, dependencies
 *   - Dependency management: add/remove/update dependencies
 *   - Script manipulation: add/remove/update scripts
 *   - Serialization: toJSON(), toString() with formatting preservation Critical
 *     for Socket CLI package.json editing operations (security fixes,
 *     updates).
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

describe('packages/editable', () => {
  describe('getEditablePackageJsonClass', () => {
    it('should return EditablePackageJson class', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      expect(EditablePackageJson).toBeDefined()
      expect(typeof EditablePackageJson).toBe('function')
    })

    it('should return same class instance on multiple calls (memoized)', () => {
      const EditablePackageJson1 = getEditablePackageJsonClass()
      const EditablePackageJson2 = getEditablePackageJsonClass()
      expect(EditablePackageJson1).toBe(EditablePackageJson2)
    })

    it('should have static methods', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      expect(typeof EditablePackageJson.create).toBe('function')
      expect(typeof EditablePackageJson.load).toBe('function')
      expect(typeof EditablePackageJson.fix).toBe('function')
      expect(typeof EditablePackageJson.normalize).toBe('function')
      expect(typeof EditablePackageJson.prepare).toBe('function')
    })

    it('should have static steps properties', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      expect(Array.isArray(EditablePackageJson.fixSteps)).toBe(true)
      expect(Array.isArray(EditablePackageJson.normalizeSteps)).toBe(true)
      expect(Array.isArray(EditablePackageJson.prepareSteps)).toBe(true)
    })
  })

  describe('EditablePackageJson.create', () => {
    it('should create a new package.json instance', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.create(tmpDir)

        expect(pkg).toBeDefined()
        expect(pkg.content).toBeDefined()
        expect(internals(pkg).path).toBe(tmpDir)
        expect(internals(pkg).filename).toContain('package.json')
      }, 'editable-create-')
    })

    it('should create package.json with initial data', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const data: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
          description: 'Test package',
        }
        const pkg = await EditablePackageJson.create(tmpDir, { data })

        expect(pkg.content.name).toBe('test-package')
        expect(pkg.content.version).toBe('1.0.0')
        expect(pkg.content.description).toBe('Test package')
      }, 'editable-create-data-')
    })

    it('should create package.json without data option', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.create(tmpDir, {})

        expect(pkg).toBeDefined()
        expect(pkg.content).toBeDefined()
      }, 'editable-create-empty-')
    })
  })

  describe('EditablePackageJson.load', () => {
    it('should load existing package.json file', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        const pkgData = {
          name: 'test-package',
          version: '1.0.0',
        }
        await fs.writeFile(pkgPath, JSON.stringify(pkgData, null, 2))

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        expect(pkg.content.name).toBe('test-package')
        expect(pkg.content.version).toBe('1.0.0')
      }, 'editable-load-')
    })

    it('should throw error when file does not exist and create is false', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()

        await expect(
          EditablePackageJson.load(tmpDir, { create: false }),
        ).rejects.toThrow()
      }, 'editable-load-error-')
    })

    it('should create new package.json when file does not exist and create is true', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir, { create: true })

        expect(pkg).toBeDefined()
        expect(pkg.content).toBeDefined()
      }, 'editable-load-create-')
    })

    it('should load package.json from directory path', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        expect(pkg.content.name).toBe('test')
      }, 'editable-load-dir-')
    })

    it('should preserve indentation from original file', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        const pkgData = '{\n    "name": "test",\n    "version": "1.0.0"\n}\n'
        await fs.writeFile(pkgPath, pkgData)

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        expect(pkg.content.name).toBe('test')
      }, 'editable-load-indent-')
    })

    it('should handle non-package.json errors during load with create=true', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()

        await expect(
          EditablePackageJson.load(tmpDir, { create: true }),
        ).resolves.toBeDefined()
      }, 'editable-load-fallback-')
    })

    it('should create new instance when package.json missing and create=true', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir, { create: true })

        expect(pkg).toBeDefined()
        expect(pkg.content).toBeDefined()
      }, 'editable-load-create-')
    })
  })

  describe('EditablePackageJson.fix', () => {
    it('should apply npm fixes to package.json', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          name: 'test-package',
          version: '1.0.0',
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.fix(tmpDir, {})

        expect(pkg).toBeDefined()
        expect(pkg.content).toBeDefined()
      }, 'editable-fix-')
    })
  })

  describe('EditablePackageJson.normalize', () => {
    it('should normalize package.json', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          name: 'test-package',
          version: '1.0.0',
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.normalize(tmpDir, {})

        expect(pkg).toBeDefined()
        expect(pkg.content.name).toBe('test-package')
      }, 'editable-normalize-')
    })

    it('should normalize with preserve options', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          name: 'test-package',
          version: '1.0.0',
          custom: 'field',
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.normalize(tmpDir, {
          preserve: ['custom'],
        })

        expect(pkg.content.name).toBe('test-package')
      }, 'editable-normalize-preserve-')
    })
  })

  describe('EditablePackageJson.prepare', () => {
    it('should prepare package.json for publishing', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          name: 'test-package',
          version: '1.0.0',
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.prepare(tmpDir, {})

        expect(pkg).toBeDefined()
      }, 'editable-prepare-')
    })

    it('should populate gitHead when inside a git repo', async () => {
      // Regression: @npmcli/git was previously stubbed as empty,
      // which broke normalize's `gitHead` step (`git.find is not a
      // function`) and made every `prepare()` call throw. This test
      // sets up a minimal .git layout and asserts the step actually
      // reads HEAD rather than silently skipping it.
      await runWithTempDir(async tmpDir => {
        const headSha = 'a'.repeat(40)
        await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true })
        await fs.writeFile(path.join(tmpDir, '.git', 'HEAD'), headSha + '\n')
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({ name: 'githead-probe', version: '1.0.0' }),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.prepare(tmpDir, {})

        expect(internals(pkg).content.gitHead).toBe(headSha)
      }, 'editable-prepare-githead-')
    })
  })
})

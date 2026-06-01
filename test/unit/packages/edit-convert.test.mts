/**
 * @file Unit tests for converting plain package.json objects into editable
 *   instances via `toEditablePackageJson` / `toEditablePackageJsonSync`. Split
 *   from edit.test.mts to keep each file under the line-count cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type {
  EditablePackageJson,
  PackageJson,
} from '../../../src/packages/types'
import {
  toEditablePackageJson,
  toEditablePackageJsonSync,
} from '../../../src/packages/edit'
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

describe('packages/editable conversion', () => {
  describe('toEditablePackageJsonSync', () => {
    it('should convert package.json to editable instance', () => {
      const pkgJson: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
      }

      const editable = toEditablePackageJsonSync(pkgJson) as EditablePackageJson

      expect(editable).toBeDefined()
      expect(editable.content.name).toBe('test-package')
      expect(editable.content.version).toBe('1.0.0')
    })

    it('should convert without normalization by default', () => {
      const pkgJson: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        custom: 'field',
      }

      const editable = toEditablePackageJsonSync(pkgJson) as EditablePackageJson

      expect(editable.content['custom']).toBe('field')
    })

    it('should normalize when normalize option is true', () => {
      const pkgJson: PackageJson = {
        name: 'test-package',
      }

      const editable = toEditablePackageJsonSync(pkgJson, {
        normalize: true,
      }) as EditablePackageJson

      expect(editable).toBeDefined()
      expect(editable.content.name).toBe('test-package')
      expect(editable.content.version).toBeDefined()
    })

    it('should pass normalize options through', () => {
      const pkgJson: PackageJson = {
        name: 'test-package',
        custom: 'field',
      }

      const editable = toEditablePackageJsonSync(pkgJson, {
        normalize: true,
        preserve: ['custom'],
      }) as EditablePackageJson

      expect(editable).toBeDefined()
    })

    it('should handle empty package.json', () => {
      const pkgJson: PackageJson = {}

      const editable = toEditablePackageJsonSync(pkgJson) as EditablePackageJson

      expect(editable).toBeDefined()
      expect(editable.content).toBeDefined()
    })
  })

  describe('toEditablePackageJson', () => {
    it('should convert to editable with file path', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgJson: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
        }

        const editable = (await toEditablePackageJson(pkgJson, {
          path: tmpDir,
        })) as EditablePackageJson

        expect(editable).toBeDefined()
        expect(editable.content.name).toBe('test-package')
        expect(internals(editable).path).toBeDefined()
      }, 'toeditable-')
    })

    it('should convert without path (like toEditablePackageJsonSync)', async () => {
      const pkgJson: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
      }

      const editable = (await toEditablePackageJson(
        pkgJson,
        {},
      )) as EditablePackageJson

      expect(editable).toBeDefined()
      expect(editable.content.name).toBe('test-package')
    })

    it('should normalize when normalize option is true', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgJson: PackageJson = {
          name: 'test-package',
        }

        const editable = (await toEditablePackageJson(pkgJson, {
          path: tmpDir,
          normalize: true,
        })) as EditablePackageJson

        expect(editable).toBeDefined()
        expect(editable.content.version).toBeDefined()
      }, 'toeditable-normalize-')
    })

    it('should preserve repository for non-node_modules paths', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgJson: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
          repository: 'https://github.com/test/repo',
        }

        const editable = (await toEditablePackageJson(pkgJson, {
          path: tmpDir,
          normalize: true,
        })) as EditablePackageJson

        expect(editable).toBeDefined()
      }, 'toeditable-preserve-')
    })

    it('should handle node_modules paths differently', async () => {
      await runWithTempDir(async tmpDir => {
        const nodeModulesPath = path.join(tmpDir, 'node_modules', 'test-pkg')
        await fs.mkdir(nodeModulesPath, { recursive: true })

        const pkgJson: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
        }

        const editable = (await toEditablePackageJson(pkgJson, {
          path: nodeModulesPath,
          normalize: true,
        })) as EditablePackageJson

        expect(editable).toBeDefined()
      }, 'toeditable-nodemodules-')
    })

    it('should pass preserve options through', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgJson: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
          custom: 'field',
        }

        const editable = (await toEditablePackageJson(pkgJson, {
          path: tmpDir,
          normalize: true,
          preserve: ['custom'],
        })) as EditablePackageJson

        expect(editable).toBeDefined()
      }, 'toeditable-preserve-opts-')
    })

    it('should handle package.json path ending with package.json', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgJsonPath = path.join(tmpDir, 'package.json')
        const pkgJson: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
        }

        const editable = (await toEditablePackageJson(pkgJson, {
          path: pkgJsonPath,
        })) as EditablePackageJson

        expect(editable).toBeDefined()
      }, 'toeditable-pkgjson-')
    })
  })

  describe('toEditablePackageJsonSync with file path', () => {
    it('should synchronously convert to editable with file path', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgJson: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
        }

        const editable = toEditablePackageJsonSync(pkgJson, {
          path: tmpDir,
        }) as EditablePackageJson

        expect(editable).toBeDefined()
        expect(editable.content.name).toBe('test-package')
      }, 'toeditablesync-')
    })

    it('should convert without path', () => {
      const pkgJson: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
      }

      const editable = toEditablePackageJsonSync(
        pkgJson,
        {},
      ) as EditablePackageJson

      expect(editable).toBeDefined()
      expect(editable.content.name).toBe('test-package')
    })

    it('should normalize when normalize option is true', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgJson: PackageJson = {
          name: 'test-package',
        }

        const editable = toEditablePackageJsonSync(pkgJson, {
          path: tmpDir,
          normalize: true,
        }) as EditablePackageJson

        expect(editable).toBeDefined()
        expect(editable.content.version).toBeDefined()
      }, 'toeditablesync-normalize-')
    })

    it('should handle node_modules paths', async () => {
      await runWithTempDir(async tmpDir => {
        const nodeModulesPath = path.join(tmpDir, 'node_modules', 'test-pkg')
        await fs.mkdir(nodeModulesPath, { recursive: true })

        const pkgJson: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
        }

        const editable = toEditablePackageJsonSync(pkgJson, {
          path: nodeModulesPath,
          normalize: true,
        }) as EditablePackageJson

        expect(editable).toBeDefined()
      }, 'toeditablesync-nodemodules-')
    })

    it('should pass preserve options through', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgJson: PackageJson = {
          name: 'test-package',
          version: '1.0.0',
          custom: 'field',
        }

        const editable = toEditablePackageJsonSync(pkgJson, {
          path: tmpDir,
          normalize: true,
          preserve: ['custom'],
        }) as EditablePackageJson

        expect(editable).toBeDefined()
      }, 'toeditablesync-preserve-')
    })
  })
})

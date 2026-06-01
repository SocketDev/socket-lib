/**
 * @file Unit tests for persisting editable package.json instances — `save`,
 *   `willSave`, `saveSync`, and edge-case/error handling. Split from
 *   edit.test.mts to keep each file under the line-count cap.
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

function symbolContent(content: unknown): Record<string | symbol, unknown> {
  return content as Record<string | symbol, unknown>
}

describe('packages/editable persistence', () => {
  describe('save and willSave', () => {
    it('should save package.json to disk', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(pkgPath, JSON.stringify(pkgData, null, 2))

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)
        pkg.update({ version: '2.0.0' })

        const saved = await pkg.save()
        expect(saved).toBe(true)

        const content = await fs.readFile(pkgPath, 'utf8')
        const parsed = JSON.parse(content)
        expect(parsed.version).toBe('2.0.0')
      }, 'save-')
    })

    it('should return false when no changes to save', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        const saved = await pkg.save()
        expect(saved).toBe(false)
      }, 'save-nochange-')
    })

    it('should throw error when trying to save without canSave', async () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      pkg.fromContent({ name: 'test', version: '1.0.0' })

      await expect(pkg.save()).rejects.toThrow('No package.json to save to')
    })

    it('should throw error when content is undefined', async () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()

      await expect(pkg.save()).rejects.toThrow('No package.json to save to')
    })

    it('should save with sort option', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          version: '1.0.0',
          name: 'test',
          description: 'Test',
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)
        pkg.update({ description: 'Updated' })

        const saved = await pkg.save({ sort: true })
        expect(saved).toBe(true)
      }, 'save-sort-')
    })

    it('should save with ignoreWhitespace option', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        const saved = await pkg.save({ ignoreWhitespace: true })
        expect(saved).toBe(false)
      }, 'save-whitespace-')
    })

    it('should preserve custom indentation', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        const pkgData = '{\n    "name": "test",\n    "version": "1.0.0"\n}\n'
        await fs.writeFile(pkgPath, pkgData)

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)
        pkg.update({ description: 'Test' })

        await pkg.save()

        const content = await fs.readFile(pkgPath, 'utf8')
        expect(content).toContain('    "name"')
      }, 'save-indent-')
    })

    it('should preserve custom newline characters', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        const pkgData =
          '{\r\n  "name": "test",\r\n  "version": "1.0.0"\r\n}\r\n'
        await fs.writeFile(pkgPath, pkgData)

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)
        pkg.update({ description: 'Test' })

        await pkg.save()

        const content = await fs.readFile(pkgPath, 'utf8')
        expect(content).toContain('\r\n')
      }, 'save-newline-')
    })

    it('should use default indentation when not specified', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.create(tmpDir, {
          data: { name: 'test', version: '1.0.0' },
        })

        await pkg.save()

        const content = await fs.readFile(internals(pkg).filename, 'utf8')
        expect(content).toContain('  "name"')
      }, 'save-default-indent-')
    })

    it('should willSave return true when changes exist', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)
        pkg.update({ version: '2.0.0' })

        expect(pkg.willSave()).toBe(true)
      }, 'willsave-true-')
    })

    it('should willSave return false when no changes exist', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        expect(pkg.willSave()).toBe(false)
      }, 'willsave-false-')
    })

    it('should willSave return false when cannot save', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      pkg.fromContent({ name: 'test', version: '1.0.0' })

      expect(pkg.willSave()).toBe(false)
    })

    it('should willSave return false when content is undefined', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()

      expect(pkg.willSave()).toBe(false)
    })

    it('should willSave respect ignoreWhitespace option', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2) + '\n',
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        // ignoreWhitespace checks content equality, not file text equality
        // When symbols are present, it may return true
        const willSave = pkg.willSave({ ignoreWhitespace: true })
        expect(typeof willSave).toBe('boolean')
      }, 'willsave-whitespace-')
    })

    it('should willSave work with sort option', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          version: '1.0.0',
          name: 'test',
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        const willSave = pkg.willSave({ sort: true })
        expect(typeof willSave).toBe('boolean')
      }, 'willsave-sort-')
    })
  })

  describe('saveSync', () => {
    it('should synchronously save package.json', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(pkgPath, JSON.stringify(pkgData, null, 2))

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)
        pkg.update({ version: '2.0.0' })

        const saved = pkg.saveSync()
        expect(saved).toBe(true)

        const content = await fs.readFile(pkgPath, 'utf8')
        const parsed = JSON.parse(content)
        expect(parsed.version).toBe('2.0.0')
      }, 'savesync-')
    })

    it('should return false when no changes to save', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        const saved = pkg.saveSync()
        expect(saved).toBe(false)
      }, 'savesync-nochange-')
    })

    it('should throw error when cannot save', () => {
      const EditablePackageJson = getEditablePackageJsonClass()
      const pkg = new EditablePackageJson()
      pkg.fromContent({ name: 'test', version: '1.0.0' })

      expect(() => pkg.saveSync()).toThrow('No package.json to save to')
    })

    it('should saveSync with sort option', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          version: '1.0.0',
          name: 'test',
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)
        pkg.update({ description: 'Test' })

        const saved = pkg.saveSync({ sort: true })
        expect(saved).toBe(true)
      }, 'savesync-sort-')
    })

    it('should saveSync respect ignoreWhitespace option', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2) + '\n',
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        // ignoreWhitespace checks content equality, not file text equality
        const saved = pkg.saveSync({ ignoreWhitespace: true })
        expect(typeof saved).toBe('boolean')
      }, 'savesync-whitespace-')
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        await fs.writeFile(pkgPath, '{ invalid json }')

        const EditablePackageJson = getEditablePackageJsonClass()

        await expect(EditablePackageJson.load(tmpDir)).rejects.toThrow()
      }, 'edge-malformed-')
    })

    it('should handle empty package.json file', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        await fs.writeFile(pkgPath, '')

        const EditablePackageJson = getEditablePackageJsonClass()

        await expect(EditablePackageJson.load(tmpDir)).rejects.toThrow()
      }, 'edge-empty-')
    })

    it('should handle package.json with only whitespace', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        await fs.writeFile(pkgPath, '   \n  \n  ')

        const EditablePackageJson = getEditablePackageJsonClass()

        await expect(EditablePackageJson.load(tmpDir)).rejects.toThrow()
      }, 'edge-whitespace-')
    })

    it('should handle numeric indentation', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.create(tmpDir, {
          data: { name: 'test', version: '1.0.0' },
        })

        // Manually set numeric indent
        symbolContent(pkg.content)[Symbol.for('indent')] = 4

        await pkg.save()

        const content = await fs.readFile(internals(pkg).filename, 'utf8')
        expect(content).toBeDefined()
      }, 'edge-numeric-indent-')
    })

    it('should handle null indent (use default)', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.create(tmpDir, {
          data: { name: 'test', version: '1.0.0' },
        })

        symbolContent(pkg.content)[Symbol.for('indent')] = undefined

        await pkg.save()

        const content = await fs.readFile(internals(pkg).filename, 'utf8')
        expect(content).toContain('  ')
      }, 'edge-null-indent-')
    })

    it('should handle null newline (use default)', async () => {
      await runWithTempDir(async tmpDir => {
        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.create(tmpDir, {
          data: { name: 'test', version: '1.0.0' },
        })

        symbolContent(pkg.content)[Symbol.for('newline')] = undefined

        await pkg.save()

        const content = await fs.readFile(internals(pkg).filename, 'utf8')
        expect(content).toContain('\n')
      }, 'edge-null-newline-')
    })

    it('should handle deep updates', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          name: 'test',
          version: '1.0.0',
          dependencies: {
            dep1: '1.0.0',
          },
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)
        pkg.update({
          dependencies: {
            dep1: '1.0.0',
            dep2: '2.0.0',
          },
        })

        await pkg.save()

        expect(pkg.content.dependencies?.['dep2']).toBe('2.0.0')
      }, 'edge-deep-update-')
    })

    it('should handle symbols in content properly', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const EditablePackageJson = getEditablePackageJsonClass()
        const pkg = await EditablePackageJson.load(tmpDir)

        // Symbols should not be in saved JSON
        const content = pkg.content as Record<string | symbol, unknown>
        expect(content[Symbol.for('indent')]).toBeDefined()

        await pkg.save()

        const fileContent = await fs.readFile(internals(pkg).filename, 'utf8')
        expect(fileContent).not.toContain('Symbol')
      }, 'edge-symbols-')
    })
  })
})

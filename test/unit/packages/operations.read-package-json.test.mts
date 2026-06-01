/**
 * @file Unit tests for package.json reading helpers from
 *   src/packages/operations: readPackageJson() and readPackageJsonSync(),
 *   covering parse, normalize, editable, preserve, and error-handling paths.
 *   Name-resolution and tag-parsing helpers live in operations.test.mts;
 *   network-backed suites live in operations.network.test.mts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  readPackageJson,
  readPackageJsonSync,
} from '../../../src/packages/operations'
import type { NormalizeOptions } from '../../../src/packages/types'
import { describe, expect, it } from 'vitest'
import { runWithTempDir } from '../util/temp-file-helper'

type ReadPackageJsonSyncOptions = NormalizeOptions & {
  editable?: boolean | undefined
  normalize?: boolean | undefined
  throws?: boolean | undefined
}

describe('packages/operations readPackageJson', () => {
  describe('readPackageJson', () => {
    it('should read and parse package.json from directory', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          name: 'test-package',
          version: '1.0.0',
          description: 'Test package',
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData, null, 2),
        )

        const result = await readPackageJson(tmpDir)
        expect(result).toBeDefined()
        expect(result?.name).toBe('test-package')
        expect(result?.version).toBe('1.0.0')
      }, 'read-pkg-json-')
    })

    it('should read package.json from file path', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgPath = path.join(tmpDir, 'package.json')
        const pkgData = { name: 'test', version: '2.0.0' }
        await fs.writeFile(pkgPath, JSON.stringify(pkgData))

        const result = await readPackageJson(pkgPath)
        expect(result?.name).toBe('test')
      }, 'read-pkg-json-file-')
    })

    it('should return undefined for non-existent file', async () => {
      await runWithTempDir(async tmpDir => {
        const result = await readPackageJson(tmpDir, { throws: false })
        expect(result).toBeUndefined()
      }, 'read-pkg-json-missing-')
    })

    it('should normalize when normalize option is true', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = await readPackageJson(tmpDir, { normalize: true })
        expect(result).toBeDefined()
        expect(result?.name).toBe('test')
        // Normalization should add version field
        expect(result?.version).toBeDefined()
      }, 'read-pkg-json-normalize-')
    })

    it('should return editable package.json when editable option is true', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = await readPackageJson(tmpDir, { editable: true })
        expect(result).toBeDefined()
        expect(typeof result?.['save']).toBe('function')
      }, 'read-pkg-json-editable-')
    })

    it('should handle editable with normalize options', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0', custom: 'field' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        // When using editable with normalize, the options are passed to the editable converter
        await expect(
          readPackageJson(tmpDir, {
            editable: true,
            normalize: true,
            preserve: ['custom'],
          }),
        ).resolves.toBeDefined()
      }, 'read-pkg-json-editable-normalize-')
    })

    it('should throw when throws option is true and file missing', async () => {
      await runWithTempDir(async tmpDir => {
        await expect(
          readPackageJson(tmpDir, { throws: true }),
        ).rejects.toThrow()
      }, 'read-pkg-json-throws-')
    })

    it('should pass normalize options through', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', custom: 'field' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = await readPackageJson(tmpDir, {
          normalize: true,
          preserve: ['custom'],
        })
        expect(result).toBeDefined()
      }, 'read-pkg-json-preserve-')
    })

    it('should handle malformed JSON gracefully', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.writeFile(path.join(tmpDir, 'package.json'), '{ invalid json')

        const result = await readPackageJson(tmpDir, { throws: false })
        expect(result).toBeUndefined()
      }, 'read-pkg-json-malformed-')
    })

    it('should not normalize by default', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', custom: 'field' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = await readPackageJson(tmpDir)
        expect(result?.['custom']).toBe('field')
      }, 'read-pkg-json-no-normalize-')
    })

    it('should handle readPackageJson with invalid JSON', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          'not valid json {{',
        )

        const result = await readPackageJson(tmpDir, { throws: false })
        expect(result).toBeUndefined()
      }, 'edge-invalid-json-')
    })

    it('should handle readPackageJson with all options', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', custom: 'value' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = await readPackageJson(tmpDir, {
          editable: false,
          normalize: true,
          throws: false,
          preserve: ['custom'],
        })

        expect(result).toBeDefined()
      }, 'read-all-opts-')
    })
  })

  describe('readPackageJsonSync', () => {
    it('should synchronously read and parse package.json', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test-sync', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = readPackageJsonSync(tmpDir)
        expect(result).toBeDefined()
        expect(result?.name).toBe('test-sync')
      }, 'read-pkg-json-sync-')
    })

    it('should return undefined for non-existent file', async () => {
      await runWithTempDir(async tmpDir => {
        const result = readPackageJsonSync(tmpDir, { throws: false })
        expect(result).toBeUndefined()
      }, 'read-pkg-json-sync-missing-')
    })

    it('should normalize when normalize option is true', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = readPackageJsonSync(tmpDir, {
          editable: false,
          normalize: true,
        } as ReadPackageJsonSyncOptions)
        expect(result?.version).toBeDefined()
      }, 'read-pkg-json-sync-normalize-')
    })

    it('should return editable when editable option is true', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = readPackageJsonSync(tmpDir, { editable: true })
        expect(result).toBeDefined()
        expect(typeof result?.['save']).toBe('function')
      }, 'read-pkg-json-sync-editable-')
    })

    it('should throw when throws option is true and file missing', async () => {
      await runWithTempDir(async tmpDir => {
        expect(() => readPackageJsonSync(tmpDir, { throws: true })).toThrow()
      }, 'read-pkg-json-sync-throws-')
    })

    it('should handle editable with normalize options', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0', custom: 'field' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        // When using editable with normalize, the options are passed to the editable converter
        expect(() =>
          readPackageJsonSync(tmpDir, {
            editable: true,
            normalize: true,
            preserve: ['custom'],
          } as ReadPackageJsonSyncOptions),
        ).not.toThrow()
      }, 'read-pkg-json-sync-editable-norm-')
    })

    it('should pass normalize options through', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', custom: 'field' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = readPackageJsonSync(tmpDir, {
          normalize: true,
          preserve: ['custom'],
        } as ReadPackageJsonSyncOptions)
        expect(result).toBeDefined()
      }, 'read-pkg-json-sync-preserve-')
    })

    it('should handle readPackageJsonSync with invalid JSON', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          'not valid json {{',
        )

        const result = readPackageJsonSync(tmpDir, { throws: false })
        expect(result).toBeUndefined()
      }, 'edge-invalid-json-sync-')
    })

    it('should handle readPackageJsonSync with all options', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', custom: 'value' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const result = readPackageJsonSync(tmpDir, {
          editable: false,
          throws: false,
          preserve: ['custom'],
        })

        expect(result).toBeDefined()
      }, 'read-sync-all-opts-')
    })
  })
})

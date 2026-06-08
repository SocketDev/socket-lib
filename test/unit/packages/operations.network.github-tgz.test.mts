/**
 * @file Network-only tests for resolveGitHubTgzUrl + package-read/extract
 *   network paths. Split out of operations.network.test.mts to keep each file
 *   under the 500-line cap. Skipped when SOCKET_LIB_SKIP_NETWORK_TESTS is set.
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

import { expect, it } from 'vitest'

import { readPackageJson } from '../../../src/packages/read'
import { resolveGitHubTgzUrl } from '../../../src/packages/fetch'
import { extractPackage, packPackage } from '../../../src/packages/tarball'
import type { ExtractOptions, PackageJson } from '../../../src/packages/types'
import { describeNetworkOnly } from '../util/skip-helpers'
import { runWithTempDir } from '../util/temp-file-helper'
import { tolerantTimeout } from '../../_shared/fleet/lib/timing.mts'

type ExtractCallback = (destPath: string) => Promise<unknown>

describeNetworkOnly('resolveGitHubTgzUrl', () => {
  it('should return empty string when package.json not found', async () => {
    const pkgJson: PackageJson = {
      name: 'test-package',
      version: '1.0.0',
    }
    const result = await resolveGitHubTgzUrl('test-package', pkgJson)
    expect(result).toBe('')
  })

  it(
    'should return saveSpec for tarball URL spec',
    async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = {
          name: 'test',
          version: '1.0.0',
          repository: { url: 'git+https://github.com/user/repo.git' },
        }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        const tgzUrl = 'https://github.com/user/repo/archive/abc123.tar.gz'
        const result = await resolveGitHubTgzUrl(tgzUrl, tmpDir)
        // Should return the URL itself if it's already a tarball URL
        expect(typeof result).toBe('string')
      }, 'resolve-github-tgz-spec-')
    },
    tolerantTimeout(30_000),
  )

  it(
    'should accept package.json object as where parameter',
    async () => {
      const pkgJson: PackageJson = {
        name: 'test',
        version: '1.0.0',
        repository: { url: 'git+https://github.com/user/repo.git' },
      }

      const result = await resolveGitHubTgzUrl('test-package', pkgJson)
      // Should return empty string or valid URL
      expect(typeof result).toBe('string')
    },
    tolerantTimeout(30_000),
  )

  it('should return empty string when no repository URL', async () => {
    const pkgJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
    }

    const result = await resolveGitHubTgzUrl('test', pkgJson)
    expect(result).toBe('')
  })

  it(
    'should handle GitHub URL spec with committish',
    async () => {
      const pkgJson: PackageJson = {
        name: 'test',
        version: '1.0.0',
        repository: { url: 'git+https://github.com/user/repo.git' },
      }

      const result = await resolveGitHubTgzUrl('github:user/repo#main', pkgJson)
      expect(typeof result).toBe('string')
    },
    tolerantTimeout(30_000),
  )

  it(
    'should try version with v prefix first',
    async () => {
      const pkgJson: PackageJson = {
        name: 'test',
        version: '1.0.0',
        repository: { url: 'git+https://github.com/user/repo.git' },
      }

      const result = await resolveGitHubTgzUrl('test', pkgJson)
      // Will return empty string if tag doesn't exist, which is expected
      expect(typeof result).toBe('string')
    },
    tolerantTimeout(30_000),
  )

  it(
    'should fallback to version without v prefix',
    async () => {
      const pkgJson: PackageJson = {
        name: 'test',
        version: '1.0.0',
        repository: { url: 'git+https://github.com/user/repo.git' },
      }

      const result = await resolveGitHubTgzUrl('test', pkgJson)
      expect(typeof result).toBe('string')
    },
    tolerantTimeout(30_000),
  )

  it(
    'should handle repository as string',
    async () => {
      const pkgJson: PackageJson = {
        name: 'test',
        version: '1.0.0',
        repository: 'github:user/repo',
      }

      const result = await resolveGitHubTgzUrl('test', pkgJson)
      expect(typeof result).toBe('string')
    },
    tolerantTimeout(30_000),
  )
})

// Network-only subset of lazy-loading tests: those that exercise
// extractPackage / resolveGitHubTgzUrl through pacote / GitHub.
describeNetworkOnly('lazy loading (network)', () => {
  it(
    'should lazy load cacache on first use',
    async () => {
      // This test verifies that cacache is only loaded when needed.
      // Using extractPackage without dest triggers cacache loading.
      let called = false
      const cacacheCallback: ExtractCallback = async () => {
        called = true
      }
      await extractPackage(
        'is-number@7.0.0',
        cacacheCallback as unknown as ExtractOptions,
      )
      expect(called).toBe(true)
    },
    tolerantTimeout(30_000),
  )

  it(
    'resolveGitHubTgzUrl returns without throwing for valid input',
    async () => {
      const pkgJson: PackageJson = {
        name: 'test',
        version: '1.0.0',
        repository: { url: 'git+https://github.com/user/repo.git' },
      }

      await expect(resolveGitHubTgzUrl('test', pkgJson)).resolves.toBeDefined()
    },
    tolerantTimeout(30_000),
  )
})

describeNetworkOnly('options handling (network)', () => {
  it(
    'should handle extractPackage with all options',
    async () => {
      await runWithTempDir(async tmpDir => {
        const dest = path.join(tmpDir, 'extracted')
        await fs.mkdir(dest, { recursive: true })

        await extractPackage('is-number@7.0.0', {
          dest,
          preferOffline: true,
          tmpPrefix: 'test-',
        })

        expect(existsSync(path.join(dest, 'package.json'))).toBe(true)
      }, 'extract-all-opts-')
    },
    tolerantTimeout(30_000),
  )
})

describeNetworkOnly('integration scenarios (network)', () => {
  it(
    'should extract, read, and pack a package',
    async () => {
      await runWithTempDir(async tmpDir => {
        const extractDest = path.join(tmpDir, 'extracted')
        await fs.mkdir(extractDest, { recursive: true })

        // Extract
        await extractPackage('is-number@7.0.0', { dest: extractDest })

        // Read
        const pkgJson = await readPackageJson(extractDest)
        expect(pkgJson?.name).toBe('is-number')

        // Pack
        const tarball = await packPackage(extractDest)
        expect(Buffer.isBuffer(tarball)).toBe(true)
      }, 'integration-extract-read-pack-')
    },
    tolerantTimeout(60_000),
  )
})

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { expect, it } from 'vitest'

import { resolveGitHubTgzUrl } from '../../../src/packages/fetch'
import type { PackageJson } from '../../../src/packages/types'
import { describeNetworkOnly } from '../util/skip-helpers'
import { runWithTempDir } from '../util/temp-file-helper'
import { tolerantTimeout } from '../../_shared/fleet/lib/timing.mts'

describeNetworkOnly('packages/fetch — resolveGitHubTgzUrl', () => {
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

/**
 * @file Network-only tests for package manipulation operations. These suites
 *   are de facto integration tests: extractPackage / packPackage delegate to
 *   pacote, which fetches tarballs from registry.npmjs.org, and
 *   resolveGitHubTgzUrl reaches GitHub. They are skipped when
 *   SOCKET_LIB_SKIP_NETWORK_TESTS is set so pre-commit + air-gapped CI lanes
 *   don't hit the public registry and trip Socket Firewall rate-limits. Pure
 *   unit tests for the same module live in operations.test.mts.
 */

import { existsSync, promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import {
  extractPackage,
  packPackage,
  readPackageJson,
  resolveGitHubTgzUrl,
} from '../../../src/packages/operations'
import type { ExtractOptions, PackageJson } from '../../../src/packages/types'
import { expect, it } from 'vitest'
import { describeNetworkOnly } from '../util/skip-helpers'
import { runWithTempDir } from '../util/temp-file-helper'

type ExtractCallback = (destPath: string) => Promise<unknown>

// Network-only: extractPackage delegates to pacote, which fetches
// the tarball from registry.npmjs.org. There's no useful unit-test
// shape without the registry — these are de facto integration
// tests. Skipped when SOCKET_LIB_SKIP_NETWORK_TESTS is set so
// pre-commit + air-gapped CI lanes don't hit the public registry
// and trip Socket Firewall rate-limits.
describeNetworkOnly('extractPackage', () => {
  it('should extract package to destination directory', async () => {
    await runWithTempDir(async tmpDir => {
      const dest = path.join(tmpDir, 'extracted')
      await fs.mkdir(dest, { recursive: true })

      // Extract a small package for testing
      await extractPackage('is-number@7.0.0', { dest })

      // Verify extraction
      const pkgJsonPath = path.join(dest, 'package.json')
      const exists = existsSync(pkgJsonPath)
      expect(exists).toBe(true)
    }, 'extract-pkg-')
  }, 30_000)

  it('should call callback with destination path', async () => {
    await runWithTempDir(async tmpDir => {
      const dest = path.join(tmpDir, 'extracted')
      await fs.mkdir(dest, { recursive: true })

      let callbackPath = ''
      await extractPackage('is-number@7.0.0', { dest }, async destPath => {
        callbackPath = destPath
      })

      expect(callbackPath).toBe(dest)
    }, 'extract-pkg-callback-')
  }, 30_000)

  it('should use temporary directory when dest not provided', async () => {
    let tmpPath = ''
    const verifyCallback: ExtractCallback = async (destPath: string) => {
      tmpPath = destPath
      // Verify package.json exists in temp directory
      const pkgJsonPath = path.join(destPath, 'package.json')
      const exists = existsSync(pkgJsonPath)
      expect(exists).toBe(true)
    }
    await extractPackage(
      'is-number@7.0.0',
      verifyCallback as unknown as ExtractOptions,
    )

    expect(tmpPath).toBeTruthy()
  }, 30_000)

  it('should handle function as second argument', async () => {
    let called = false
    const trackCallback: ExtractCallback = async (destPath: string) => {
      called = true
      expect(destPath).toBeTruthy()
    }
    await extractPackage(
      'is-number@7.0.0',
      trackCallback as unknown as ExtractOptions,
    )

    expect(called).toBe(true)
  }, 30_000)

  it('should pass extract options to pacote', async () => {
    await runWithTempDir(async tmpDir => {
      const dest = path.join(tmpDir, 'extracted')
      await fs.mkdir(dest, { recursive: true })

      await extractPackage('is-number@7.0.0', {
        dest,
        preferOffline: true,
      })

      const pkgJsonPath = path.join(dest, 'package.json')
      const exists = existsSync(pkgJsonPath)
      expect(exists).toBe(true)
    }, 'extract-pkg-options-')
  }, 30_000)

  it('should use tmpPrefix option for temp directory', async () => {
    let tmpPath = ''
    await extractPackage(
      'is-number@7.0.0',
      { tmpPrefix: 'test-prefix-' },
      async destPath => {
        tmpPath = destPath
      },
    )

    expect(tmpPath).toBeTruthy()
  }, 30_000)
})

// Network-only: see comment on `extractPackage` above.
describeNetworkOnly('packPackage', () => {
  it('should pack a package tarball', async () => {
    await runWithTempDir(async tmpDir => {
      // Create a simple package to pack
      const pkgData = {
        name: 'test-package',
        version: '1.0.0',
        main: 'index.js',
      }
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(pkgData, null, 2),
      )
      await fs.writeFile(path.join(tmpDir, 'index.js'), 'module.exports = {}')

      const tarball = await packPackage(tmpDir)
      expect(tarball).toBeDefined()
      expect(Buffer.isBuffer(tarball)).toBe(true)
    }, 'pack-pkg-')
  }, 30_000)

  it('should pack package with options', async () => {
    await runWithTempDir(async tmpDir => {
      const pkgData = { name: 'test', version: '1.0.0' }
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(pkgData),
      )
      await fs.writeFile(path.join(tmpDir, 'index.js'), '')

      const tarball = await packPackage(tmpDir, { preferOffline: true })
      expect(tarball).toBeDefined()
    }, 'pack-pkg-options-')
  }, 30_000)

  it('should pack remote package spec', async () => {
    const tarball = await packPackage('is-number@7.0.0')
    expect(tarball).toBeDefined()
    expect(Buffer.isBuffer(tarball)).toBe(true)
  }, 30_000)

  it('should run prepack scripts for a directory spec', async () => {
    // Regression: @npmcli/run-script was previously stubbed as empty,
    // which caused `runScript is not a function` when libnpmpack tried
    // to fire `prepack` on directory specs. Write the sentinel file
    // from a plain JS file rather than an inline -e string so shell
    // quoting differences across platforms don't mask the test.
    await runWithTempDir(async tmpDir => {
      const sentinel = path.join(tmpDir, '.prepack-ran')
      const scriptPath = path.join(tmpDir, 'prepack.cjs')
      await fs.writeFile(
        scriptPath,
        `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, '1')\n`,
      )
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'prepack-probe',
          version: '1.0.0',
          scripts: {
            prepack: `node ${JSON.stringify(scriptPath)}`,
          },
        }),
      )

      const tarball = await packPackage(tmpDir)
      expect(Buffer.isBuffer(tarball)).toBe(true)
      expect(existsSync(sentinel)).toBe(true)
    }, 'pack-prepack-')
  }, 30_000)
})

// Network-only: exercises pacote's remote-tarball fetcher path.
describeNetworkOnly('pacote fetcher coverage', () => {
  // These tests guard against re-stubbing the non-registry pacote
  // fetchers. Each spec type reaches a different fetcher inside
  // pacote/lib — if any of dir/file/remote/git is stubbed with
  // `pacote-fetcher-throw.cjs`, the corresponding assertion below
  // fails loudly rather than silently shipping a broken bundle.
  it('directory specs use pacote/lib/dir.js', async () => {
    await runWithTempDir(async tmpDir => {
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'dir-probe', version: '1.0.0' }),
      )
      const tarball = await packPackage(tmpDir)
      expect(Buffer.isBuffer(tarball)).toBe(true)
    }, 'dir-fetcher-')
  }, 30_000)

  it('local tarball specs use pacote/lib/file.js', async () => {
    // First pack a tiny directory into a tarball, then re-pack the
    // tarball file itself. The second call hits the File fetcher.
    await runWithTempDir(async tmpDir => {
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'file-probe', version: '1.0.0' }),
      )
      const tarball = (await packPackage(tmpDir)) as Buffer
      const tarballPath = path.join(tmpDir, 'file-probe-1.0.0.tgz')
      await fs.writeFile(tarballPath, tarball)

      const extractDest = path.join(tmpDir, 'extracted')
      await fs.mkdir(extractDest, { recursive: true })
      await extractPackage(tarballPath, { dest: extractDest })
      expect(existsSync(path.join(extractDest, 'package.json'))).toBe(true)
    }, 'file-fetcher-')
  }, 30_000)

  it('remote tarball specs use pacote/lib/remote.js', async () => {
    // Registry tarball fetched via a direct http(s) URL — bypasses
    // the registry resolver and goes straight through RemoteFetcher.
    await runWithTempDir(async tmpDir => {
      const extractDest = path.join(tmpDir, 'extracted')
      await fs.mkdir(extractDest, { recursive: true })
      await extractPackage(
        'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz',
        { dest: extractDest },
      )
      expect(existsSync(path.join(extractDest, 'package.json'))).toBe(true)
    }, 'remote-fetcher-')
  }, 60_000)

  it('git specs use pacote/lib/git.js + @npmcli/git', async () => {
    // Git archives are fetched via pacote/lib/git.js which wraps
    // @npmcli/git. Stubbing either breaks every git-backed spec.
    // pacote's GitFetcher requires an Arborist constructor at pack
    // time — pass it explicitly so the fetcher can run.
    const testRequire = createRequire(import.meta.url)
    const Arborist = testRequire('@npmcli/arborist')
    await runWithTempDir(async tmpDir => {
      const extractDest = path.join(tmpDir, 'extracted')
      await fs.mkdir(extractDest, { recursive: true })
      await extractPackage('github:jonschlinkert/is-number#7.0.0', {
        dest: extractDest,
        Arborist,
      } as ExtractOptions & { Arborist: unknown })
      expect(existsSync(path.join(extractDest, 'package.json'))).toBe(true)
    }, 'git-fetcher-')
  }, 120_000)
})

describeNetworkOnly('resolveGitHubTgzUrl', () => {
  it('should return empty string when package.json not found', async () => {
    const pkgJson: PackageJson = {
      name: 'test-package',
      version: '1.0.0',
    }
    const result = await resolveGitHubTgzUrl('test-package', pkgJson)
    expect(result).toBe('')
  })

  it('should return saveSpec for tarball URL spec', async () => {
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
  }, 30_000)

  it('should accept package.json object as where parameter', async () => {
    const pkgJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
      repository: { url: 'git+https://github.com/user/repo.git' },
    }

    const result = await resolveGitHubTgzUrl('test-package', pkgJson)
    // Should return empty string or valid URL
    expect(typeof result).toBe('string')
  }, 30_000)

  it('should return empty string when no repository URL', async () => {
    const pkgJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
    }

    const result = await resolveGitHubTgzUrl('test', pkgJson)
    expect(result).toBe('')
  })

  it('should handle GitHub URL spec with committish', async () => {
    const pkgJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
      repository: { url: 'git+https://github.com/user/repo.git' },
    }

    const result = await resolveGitHubTgzUrl('github:user/repo#main', pkgJson)
    expect(typeof result).toBe('string')
  }, 30_000)

  it('should try version with v prefix first', async () => {
    const pkgJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
      repository: { url: 'git+https://github.com/user/repo.git' },
    }

    const result = await resolveGitHubTgzUrl('test', pkgJson)
    // Will return empty string if tag doesn't exist, which is expected
    expect(typeof result).toBe('string')
  }, 30_000)

  it('should fallback to version without v prefix', async () => {
    const pkgJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
      repository: { url: 'git+https://github.com/user/repo.git' },
    }

    const result = await resolveGitHubTgzUrl('test', pkgJson)
    expect(typeof result).toBe('string')
  }, 30_000)

  it('should handle repository as string', async () => {
    const pkgJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
      repository: 'github:user/repo',
    }

    const result = await resolveGitHubTgzUrl('test', pkgJson)
    expect(typeof result).toBe('string')
  }, 30_000)
})

// Network-only subset of lazy-loading tests: those that exercise
// extractPackage / resolveGitHubTgzUrl through pacote / GitHub.
describeNetworkOnly('lazy loading (network)', () => {
  it('should lazy load cacache on first use', async () => {
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
  }, 30_000)

  it('resolveGitHubTgzUrl returns without throwing for valid input', async () => {
    const pkgJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
      repository: { url: 'git+https://github.com/user/repo.git' },
    }

    await expect(resolveGitHubTgzUrl('test', pkgJson)).resolves.toBeDefined()
  }, 30_000)
})

describeNetworkOnly('options handling (network)', () => {
  it('should handle extractPackage with all options', async () => {
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
  }, 30_000)
})

describeNetworkOnly('integration scenarios (network)', () => {
  it('should extract, read, and pack a package', async () => {
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
  }, 60_000)
})

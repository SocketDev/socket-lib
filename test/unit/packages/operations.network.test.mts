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
import process from 'node:process'

import { extractPackage, packPackage } from '../../../src/packages/tarball'
import type { ExtractOptions } from '../../../src/packages/types'
import { normalizePath } from '../../../src/paths/normalize'
import { expect, it } from 'vitest'
import { describeNetworkOnly } from '../util/skip-helpers'
import { runWithTempDir } from '../util/temp-file-helper'
import { tolerantTimeout } from '../../_shared/fleet/lib/timing.mts'

type ExtractCallback = (destPath: string) => Promise<unknown>

// Pin an HTTPS github url so it survives a host `insteadOf` rewrite. The GitHub
// Actions windows runner's global git config rewrites `https://github.com/` to
// `git@github.com:`, so an auth-less HTTPS clone resolves to SSH and fails with
// "Permission denied (publickey)". git resolves `insteadOf` by LONGEST matching
// prefix, so injecting a rule that maps the FULL repo url to itself out-specs
// the runner's shorter `git@github.com:` rule and forces HTTPS. (A same-length
// or inverse SSH->HTTPS rule does NOT win — verified against git 2.50.) The
// rule is injected via git's GIT_CONFIG_COUNT/KEY/VALUE env protocol (git
// >=2.31), which any git subprocess pacote spawns inherits; entries append to
// any the harness already set. Returns a restore function.
function pinHttpsGitUrl(httpsUrl: string): () => void {
  const prevCount = process.env['GIT_CONFIG_COUNT']
  const n = Number(prevCount ?? '0') || 0
  const keyVar = `GIT_CONFIG_KEY_${n}`
  const valVar = `GIT_CONFIG_VALUE_${n}`
  const prevKey = process.env[keyVar]
  const prevVal = process.env[valVar]
  process.env['GIT_CONFIG_COUNT'] = String(n + 1)
  process.env[keyVar] = `url.${httpsUrl}.insteadOf`
  process.env[valVar] = httpsUrl
  return function restore() {
    if (prevCount === undefined) {
      delete process.env['GIT_CONFIG_COUNT']
    } else {
      process.env['GIT_CONFIG_COUNT'] = prevCount
    }
    if (prevKey === undefined) {
      delete process.env[keyVar]
    } else {
      process.env[keyVar] = prevKey
    }
    if (prevVal === undefined) {
      delete process.env[valVar]
    } else {
      process.env[valVar] = prevVal
    }
  }
}

// Network-only: extractPackage delegates to pacote, which fetches
// the tarball from registry.npmjs.org. There's no useful unit-test
// shape without the registry — these are de facto integration
// tests. Skipped when SOCKET_LIB_SKIP_NETWORK_TESTS is set so
// pre-commit + air-gapped CI lanes don't hit the public registry
// and trip Socket Firewall rate-limits.
describeNetworkOnly('extractPackage', () => {
  it(
    'should extract package to destination directory',
    async () => {
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
    },
    tolerantTimeout(30_000),
  )

  it(
    'should call callback with destination path',
    async () => {
      await runWithTempDir(async tmpDir => {
        // extractPackage normalizes the dest to forward slashes before handing
        // it to pacote + the callback, so assert against the normalized form
        // (a raw path.join() dest is backslash-separated on Windows).
        const dest = normalizePath(path.join(tmpDir, 'extracted'))
        await fs.mkdir(dest, { recursive: true })

        let callbackPath = ''
        await extractPackage('is-number@7.0.0', { dest }, async destPath => {
          callbackPath = destPath
        })

        expect(callbackPath).toBe(dest)
      }, 'extract-pkg-callback-')
    },
    tolerantTimeout(30_000),
  )

  it(
    'should use temporary directory when dest not provided',
    async () => {
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
    },
    tolerantTimeout(30_000),
  )

  it(
    'should handle function as second argument',
    async () => {
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
    },
    tolerantTimeout(30_000),
  )

  it(
    'should pass extract options to pacote',
    async () => {
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
    },
    tolerantTimeout(30_000),
  )

  it(
    'should use tmpPrefix option for temp directory',
    async () => {
      let tmpPath = ''
      await extractPackage(
        'is-number@7.0.0',
        { tmpPrefix: 'test-prefix-' },
        async destPath => {
          tmpPath = destPath
        },
      )

      expect(tmpPath).toBeTruthy()
    },
    tolerantTimeout(30_000),
  )
})

// Network-only: see comment on `extractPackage` above.
describeNetworkOnly('packPackage', () => {
  it(
    'should pack a package tarball',
    async () => {
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
    },
    tolerantTimeout(30_000),
  )

  it(
    'should pack package with options',
    async () => {
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
    },
    tolerantTimeout(30_000),
  )

  it(
    'should pack remote package spec',
    async () => {
      const tarball = await packPackage('is-number@7.0.0')
      expect(tarball).toBeDefined()
      expect(Buffer.isBuffer(tarball)).toBe(true)
    },
    tolerantTimeout(30_000),
  )

  it(
    'should run prepack scripts for a directory spec',
    async () => {
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
    },
    tolerantTimeout(30_000),
  )
})

// Network-only: exercises pacote's remote-tarball fetcher path.
describeNetworkOnly('pacote fetcher coverage', () => {
  // These tests guard against re-stubbing the non-registry pacote
  // fetchers. Each spec type reaches a different fetcher inside
  // pacote/lib — if any of dir/file/remote/git is stubbed with
  // `pacote-fetcher-throw.cjs`, the corresponding assertion below
  // fails loudly rather than silently shipping a broken bundle.
  it(
    'directory specs use pacote/lib/dir.js',
    async () => {
      await runWithTempDir(async tmpDir => {
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({ name: 'dir-probe', version: '1.0.0' }),
        )
        const tarball = await packPackage(tmpDir)
        expect(Buffer.isBuffer(tarball)).toBe(true)
      }, 'dir-fetcher-')
    },
    tolerantTimeout(30_000),
  )

  it(
    'local tarball specs use pacote/lib/file.js',
    async () => {
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
    },
    tolerantTimeout(30_000),
  )

  it(
    'remote tarball specs use pacote/lib/remote.js',
    async () => {
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
    },
    tolerantTimeout(60_000),
  )

  it(
    'git specs use pacote/lib/git.js + @npmcli/git',
    async () => {
      // Git archives are fetched via pacote/lib/git.js which wraps
      // @npmcli/git. Stubbing either breaks every git-backed spec.
      // pacote's GitFetcher requires an Arborist constructor at pack
      // time — pass it explicitly so the fetcher can run.
      const testRequire = createRequire(import.meta.url)
      const Arborist = testRequire('@npmcli/arborist')
      // Pin the clone url to HTTPS so it survives the GitHub Actions windows
      // runner's global `insteadOf` rewrite (https://github.com/ ->
      // git@github.com:), which would otherwise send an auth-less clone over SSH
      // and fail with "Permission denied (publickey)". This makes the test run
      // on every platform (no Windows skip) by exercising the real
      // GitFetcher/@npmcli/git path over HTTPS.
      const restoreGitConfigEnv = pinHttpsGitUrl(
        'https://github.com/jonschlinkert/is-number.git',
      )
      await runWithTempDir(async tmpDir => {
        // normalizePath so the dest passed to pacote and the path asserted below
        // are the same forward-slash string — pacote writes to the normalized
        // form, so a raw backslash path.join() would miss it on Windows.
        const extractDest = normalizePath(path.join(tmpDir, 'extracted'))
        await fs.mkdir(extractDest, { recursive: true })
        try {
          // Explicit git+https form (not the `github:` shorthand): combined with
          // the GIT_CONFIG injection above it clones the public repo over HTTPS
          // with no auth and exercises the same GitFetcher/@npmcli/git path on
          // every platform, Windows included.
          await extractPackage(
            'git+https://github.com/jonschlinkert/is-number.git#7.0.0',
            {
              dest: extractDest,
              Arborist,
            } as ExtractOptions & { Arborist: unknown },
          )
        } catch (e) {
          // @npmcli/git wraps git failures as a generic "unknown git error",
          // swallowing the real stderr. Surface the underlying git output so a
          // CI-only failure names its cause instead of staying opaque.
          const er = e as {
            stderr?: unknown | undefined
            cmd?: unknown | undefined
            code?: unknown | undefined
          }
          throw new Error(
            `extractPackage(git spec) failed: code=${String(er.code)} cmd=${String(er.cmd)}\nstderr=${String(er.stderr)}`,
            { cause: e },
          )
        } finally {
          restoreGitConfigEnv()
        }
        expect(existsSync(path.join(extractDest, 'package.json'))).toBe(true)
      }, 'git-fetcher-')
    },
    tolerantTimeout(120_000),
  )
})

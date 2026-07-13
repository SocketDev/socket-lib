import { existsSync, promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { readPackageJson } from '../../../src/packages/read'
import { extractPackage, packPackage } from '../../../src/packages/tarball'
import type { ExtractOptions } from '../../../src/packages/types'
import { normalizePath } from '../../../src/paths/normalize'
import { describeNetworkOnly } from '../util/skip-helpers'
import { runWithTempDir } from '../util/temp-file-helper'
import { tolerantTimeout } from '../../_shared/fleet/lib/timing.mts'

type ExtractCallback = (destPath: string) => Promise<unknown>

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

describeNetworkOnly('packages/tarball — lazy loading (network)', () => {
  it(
    'should lazy load cacache on first use',
    async () => {
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
})

describeNetworkOnly('packages/tarball — options handling (network)', () => {
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

describeNetworkOnly(
  'packages/tarball — integration scenarios (network)',
  () => {
    it(
      'should extract, read, and pack a package',
      async () => {
        await runWithTempDir(async tmpDir => {
          const extractDest = path.join(tmpDir, 'extracted')
          await fs.mkdir(extractDest, { recursive: true })

          await extractPackage('is-number@7.0.0', { dest: extractDest })

          const pkgJson = await readPackageJson(extractDest)
          expect(pkgJson?.name).toBe('is-number')

          const tarball = await packPackage(extractDest)
          expect(Buffer.isBuffer(tarball)).toBe(true)
        }, 'integration-extract-read-pack-')
      },
      tolerantTimeout(60_000),
    )
  },
)

describeNetworkOnly('extractPackage', () => {
  it(
    'should extract package to destination directory',
    async () => {
      await runWithTempDir(async tmpDir => {
        const dest = path.join(tmpDir, 'extracted')
        await fs.mkdir(dest, { recursive: true })

        await extractPackage('is-number@7.0.0', { dest })

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

describeNetworkOnly('packPackage', () => {
  it(
    'should pack a package tarball',
    async () => {
      await runWithTempDir(async tmpDir => {
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

describeNetworkOnly('pacote fetcher coverage', () => {
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
      const testRequire = createRequire(import.meta.url)
      const Arborist = testRequire('@npmcli/arborist')
      const restoreGitConfigEnv = pinHttpsGitUrl(
        'https://github.com/jonschlinkert/is-number.git',
      )
      await runWithTempDir(async tmpDir => {
        const extractDest = normalizePath(path.join(tmpDir, 'extracted'))
        await fs.mkdir(extractDest, { recursive: true })
        try {
          await extractPackage(
            'git+https://github.com/jonschlinkert/is-number.git#7.0.0',
            {
              dest: extractDest,
              Arborist,
            } as ExtractOptions & { Arborist: unknown },
          )
        } catch (e) {
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

describe('packages/tarball — error handling', () => {
  it(
    'should handle extractPackage with invalid spec',
    async () => {
      await expect(
        extractPackage('non-existent-package-xyz-123', { dest: '/tmp/test' }),
      ).rejects.toThrow()
    },
    tolerantTimeout(30_000),
  )

  it(
    'should handle packPackage with invalid path',
    async () => {
      await expect(packPackage('/non/existent/path')).rejects.toThrow()
    },
    tolerantTimeout(30_000),
  )

  it(
    'packPackage rejects for non-existent directory',
    async () => {
      await expect(packPackage('/non/existent')).rejects.toThrow()
    },
    tolerantTimeout(30_000),
  )

  it(
    'extractPackage rejects for invalid spec',
    async () => {
      await expect(
        extractPackage('invalid-spec-xyz', { dest: '/tmp/test' }),
      ).rejects.toThrow()
    },
    tolerantTimeout(30_000),
  )
})

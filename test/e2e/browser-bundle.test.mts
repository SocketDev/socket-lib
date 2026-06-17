/**
 * @file E2E: bundle a socket-lib surface for the BROWSER with webpack (and
 *   esbuild) and assert it bundles clean. Guards that node/module.ts's bare
 *   `module` import stays browser-safe: the lib's package.json `browser` field
 *   maps every node builtin (incl. `module`) to `false`, so a browser bundler
 *   stubs it instead of throwing UnhandledSchemeError (which a `node:` prefix
 *   would). The esbuild arm skips until that soak-gated dep is installed.
 */
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import webpack from 'webpack'

import { tolerantTimeout } from '../_shared/fleet/lib/timing.mts'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..', '..')
const fixtureDir = path.resolve(repoRoot, 'test', 'fixtures', 'browser')
const entry = path.join(fixtureDir, 'entry.mjs')
const localRequire = createRequire(import.meta.url)

// Minimal shape — esbuild is soak-gated, so it can't be a resolvable type
// import while absent; the arm only runs once esbuild is installed.
interface EsbuildLike {
  build(options: {
    absWorkingDir: string
    bundle: boolean
    entryPoints: string[]
    platform: string
    write: boolean
  }): Promise<{ errors: unknown[] }>
}

// Resolve @socketsecurity/lib to THIS repo (the self-dep symlinks to the
// published version), so the bundle exercises the local dist + browser field.
function linkLocalLib(): void {
  const scopeDir = path.join(fixtureDir, 'node_modules', '@socketsecurity')
  mkdirSync(scopeDir, { recursive: true })
  const link = path.join(scopeDir, 'lib')
  rmSync(link, { force: true })
  symlinkSync(repoRoot, link, 'dir')
}

function hasEsbuild(): boolean {
  try {
    localRequire.resolve('esbuild')
    return true
  } catch {
    return false
  }
}

describe('browser-bundle e2e', () => {
  it(
    'webpack bundles the lib for target:web (node builtins stubbed)',
    async () => {
      linkLocalLib()
      const outDir = path.join(os.tmpdir(), 'socket-lib-webpack-e2e')
      rmSync(outDir, { force: true, recursive: true })
      const config: webpack.Configuration = {
        entry,
        target: 'web',
        mode: 'production',
        output: { path: outDir, filename: 'bundle.js' },
        resolve: {
          conditionNames: ['browser', 'import', 'require', 'default'],
        },
      }
      const stats = await new Promise<webpack.Stats | undefined>(
        (resolve, reject) => {
          webpack(config, (error, result) => {
            if (error) {
              reject(error)
            } else {
              resolve(result)
            }
          })
        },
      )
      expect(
        stats?.hasErrors(),
        stats?.toString({ all: false, errors: true }),
      ).toBe(false)
      expect(existsSync(path.join(outDir, 'bundle.js'))).toBe(true)
    },
    tolerantTimeout(120_000),
  )

  describe.skipIf(!hasEsbuild())('esbuild', () => {
    it(
      'bundles the lib for platform:browser (node builtins stubbed)',
      async () => {
        linkLocalLib()
        const esbuild = localRequire('esbuild') as EsbuildLike
        const result = await esbuild.build({
          absWorkingDir: fixtureDir,
          bundle: true,
          entryPoints: [entry],
          platform: 'browser',
          write: false,
        })
        expect(result.errors).toHaveLength(0)
      },
      tolerantTimeout(120_000),
    )
  })
})

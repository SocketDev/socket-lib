/**
 * @file E2E: bundle a socket-lib surface for the BROWSER with webpack (and
 *   esbuild) and assert it bundles clean. Guards that node/module.ts's bare
 *   `module` import stays browser-safe: the lib's package.json `browser` field
 *   maps every node builtin (incl. `module`) to `false`, so a browser bundler
 *   stubs it instead of throwing UnhandledSchemeError (which a `node:` prefix
 *   would). The esbuild arm skips until that soak-gated dep is installed. The
 *   debug/memo arm goes further than bundling: it EXECUTES the emitted bundle
 *   inside a bare `node:vm` context (no `process` global) to prove the
 *   browser-load contract — the graph evaluates cleanly, `debugLog` no-ops, and
 *   `memoizeAsync` works. The npm/registry arm applies the same vm-execution
 *   proof to the npm registry module: pure parsers and encoding helpers must
 *   evaluate and run in a process-less context.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { describe, expect, it } from 'vitest'
import webpack from 'webpack'

import { tolerantTimeout } from '../_shared/fleet/lib/timing.mts'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..', '..')
const fixtureDir = path.resolve(repoRoot, 'test', 'fixtures', 'browser')
const entry = path.join(fixtureDir, 'entry.mjs')
const entryDebug = path.join(fixtureDir, 'entry-debug.mjs')
const entryBuiltinAi = path.join(fixtureDir, 'entry-builtin-ai.mjs')
const entryNpm = path.join(fixtureDir, 'entry-npm.mjs')
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
  rmSync(link, { force: true, recursive: true })
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

  it(
    'debug/output + memo/async load and run in a process-less vm context',
    async () => {
      linkLocalLib()
      const outDir = path.join(os.tmpdir(), 'socket-lib-webpack-e2e-debug')
      rmSync(outDir, { force: true, recursive: true })
      const config: webpack.Configuration = {
        entry: entryDebug,
        target: 'web',
        mode: 'production',
        output: {
          filename: 'debug-bundle.js',
          globalObject: 'globalThis',
          library: { name: 'socketLibBrowserE2e', type: 'var' },
          path: outDir,
          publicPath: '',
        },
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

      // Execute the bundle in a bare vm context: console (browsers have it)
      // but NO process global — module evaluation must not touch it.
      const source = readFileSync(path.join(outDir, 'debug-bundle.js'), 'utf8')
      const sandbox: Record<string, unknown> = { console }
      vm.createContext(sandbox)
      vm.runInContext(source, sandbox)
      const bundled = sandbox['socketLibBrowserE2e'] as {
        run(): Promise<{
          a: number
          b: number
          cached: number
          calls: number
          debugLogThrew: boolean
        }>
      }
      const result = await bundled.run()
      expect(result).toEqual({
        a: 42,
        b: 42,
        cached: 7,
        calls: 1,
        debugLogThrew: false,
      })
    },
    tolerantTimeout(120_000),
  )

  it(
    'language-model resolver returns the browser global without a Node runtime',
    async () => {
      linkLocalLib()
      const outDir = path.join(
        os.tmpdir(),
        'socket-lib-webpack-e2e-language-model',
      )
      rmSync(outDir, { force: true, recursive: true })
      const config: webpack.Configuration = {
        entry: entryBuiltinAi,
        target: 'web',
        mode: 'production',
        output: {
          filename: 'language-model-bundle.js',
          globalObject: 'globalThis',
          library: { name: 'socketLibLanguageModelE2e', type: 'var' },
          path: outDir,
          publicPath: '',
        },
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

      const source = readFileSync(
        path.join(outDir, 'language-model-bundle.js'),
        'utf8',
      )
      const browserFactory = {
        availability: async () => 'available',
        create: async () => Object.create(null),
      }
      const sandbox: Record<string, unknown> = {
        LanguageModel: browserFactory,
        console,
      }
      vm.createContext(sandbox)
      vm.runInContext(source, sandbox)
      const bundled = sandbox['socketLibLanguageModelE2e'] as {
        getFactory(): unknown
      }
      expect(bundled.getFactory()).toBe(browserFactory)
    },
    tolerantTimeout(120_000),
  )

  it(
    'npm/registry module evaluates and runs in a process-less vm context',
    async () => {
      linkLocalLib()
      const outDir = path.join(os.tmpdir(), 'socket-lib-webpack-e2e-npm')
      rmSync(outDir, { force: true, recursive: true })
      const config: webpack.Configuration = {
        entry: entryNpm,
        target: 'web',
        mode: 'production',
        output: {
          filename: 'npm-bundle.js',
          globalObject: 'globalThis',
          library: { name: 'socketLibNpmE2e', type: 'var' },
          path: outDir,
          publicPath: '',
        },
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

      // Execute in a bare vm context — no `process` global — to prove the
      // module graph does not touch process or node:* at evaluation time.
      const source = readFileSync(path.join(outDir, 'npm-bundle.js'), 'utf8')
      const sandbox: Record<string, unknown> = { console }
      vm.createContext(sandbox)
      vm.runInContext(source, sandbox)
      const bundled = sandbox['socketLibNpmE2e'] as {
        run(): {
          cdnEncoded: string
          cdnPath: string
          name: string
          noAttestation: boolean
          registryEncoded: string
          withAttestation: boolean
        }
      }
      const result = bundled.run()
      expect(result).toEqual({
        cdnEncoded: '%40scope/pkg',
        cdnPath: '%40scope/pkg@1.0.0/package.json',
        name: 'test-pkg',
        noAttestation: false,
        registryEncoded: '@scope%2Fpkg',
        withAttestation: true,
      })
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

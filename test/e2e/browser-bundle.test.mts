/**
 * @file E2E: bundle a socket-lib surface for the BROWSER with webpack AND with
 *   esbuild and assert it bundles clean. Guards that node/module.ts's bare
 *   `module` import stays browser-safe: the lib's package.json `browser` field
 *   maps every node builtin (incl. `module`) to `false`, so a browser bundler
 *   stubs it instead of throwing UnhandledSchemeError (which a `node:` prefix
 *   would).
 *   Most arms go further than bundling: they EXECUTE the emitted bundle inside
 *   a bare `node:vm` context with no `process` and no `require`, so a
 *   surviving Node dependency fails HERE rather than in a consumer's build.
 *
 *   - debug/memo — the graph evaluates, `debugLog` no-ops, `memoizeAsync` works.
 *   - npm/registry — pure parsers and encoding helpers run process-less.
 *   - npm tarball — a REAL gzipped tar goes through `DecompressionStream` and the
 *     pure header walk, with only the web globals a browser supplies.
 *   - npm metadata — imports the BARE `./npm/meta` and `./npm/meta-cache`
 *     subpaths, so the bundler resolving their `browser` condition to the twin,
 *     rather than to the cacache-backed Node half, is what makes the bundle
 *     build and run at all. BOTH BUNDLERS RUN THE SAME ASSERTIONS. The
 *     browser-twin arms are written once as {@link observeNpmTarballTwin} and
 *     {@link observeNpmMetaTwin}, then run under webpack and under esbuild. Two
 *     independent implementations of conditional exports agreeing on which twin
 *     `./npm/meta` resolves to is the claim; one bundler alone could be
 *     agreeing with its own quirk. Both rigs live in
 *     `./browser-bundle-helpers`.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

import { tolerantTimeout } from '../_shared/fleet/lib/timing.mts'
import {
  makePackageTarball,
  MANIFEST,
} from '../unit/npm/registry/tarball/tarball-helpers.mts'
import {
  bundleForWeb,
  bundleForWebWithEsbuild,
  fixtureDir,
} from './browser-bundle-helpers.mts'

import type { WebBundler } from './browser-bundle-helpers.mts'

const entry = path.join(fixtureDir, 'entry.mjs')
const entryDebug = path.join(fixtureDir, 'entry-debug.mjs')
const entryBuiltinAi = path.join(fixtureDir, 'entry-builtin-ai.mjs')
const entryNpm = path.join(fixtureDir, 'entry-npm.mjs')
const entryNpmMeta = path.join(fixtureDir, 'entry-npm-meta.mjs')
const entryNpmTarball = path.join(fixtureDir, 'entry-npm-tarball.mjs')

/**
 * Run a bundle inside a bare vm context and return the library global. The
 * sandbox holds ONLY what is passed plus `console`; `process` and `require`
 * are absent by construction, which is the property every arm relies on.
 */
function runInBareContext<T>(
  source: string,
  library: string,
  globals: Record<string, unknown> = {},
): T {
  const sandbox: Record<string, unknown> = { console, ...globals }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  return sandbox[library] as T
}

/**
 * Bundle the npm tarball browser twin and run it process-less, returning what
 * was observed rather than asserting it.
 *
 * The observation is a flat object so ONE `expect` in the test case covers the
 * bundle outcome and both behaviours: a bundling failure lands in `errors` and
 * shows the bundler's own text in the diff instead of a bare rejection. Every
 * bundler arm calls this, so the expected result is written once as
 * {@link NPM_TARBALL_TWIN}.
 *
 * The tarball bytes are built on the Node side so no binary fixture is checked
 * in, and the sandbox gets only the four web globals a real browser supplies.
 */
async function observeNpmTarballTwin(
  bundle: WebBundler,
  filename: string,
): Promise<Record<string, unknown>> {
  const result = await bundle({
    entry: entryNpmTarball,
    filename,
    library: 'socketLibNpmTarballE2e',
  })
  if (result.errors) {
    return { errors: result.errors }
  }
  const bundled = runInBareContext<{
    rejectsPlainBytes(): Promise<boolean>
    run(bytes: Uint8Array): Promise<{
      manifestName: string
      manifestVersion: string
      names: string[]
    }>
  }>(result.source, 'socketLibNpmTarballE2e', {
    Blob,
    DecompressionStream,
    Response,
    TextDecoder,
  })
  const bytes = await makePackageTarball()
  return {
    errors: undefined,
    ...(await bundled.run(bytes)),
    rejectsPlainBytes: await bundled.rejectsPlainBytes(),
  }
}

/**
 * What {@link observeNpmTarballTwin} must observe under every bundler.
 */
const NPM_TARBALL_TWIN = {
  errors: undefined,
  manifestName: MANIFEST.name,
  manifestVersion: MANIFEST.version,
  names: ['index.mjs', 'package.json'],
  // Plain (ungzipped) bytes are rejected, so the reader is really gunzipping
  // rather than getting lucky on a tar it never decompressed.
  rejectsPlainBytes: true,
}

/**
 * The packument the metadata twin is fed. Two versions with `time` entries,
 * which is the minimum shape `getLatestVersion` and `getVersions` both read.
 */
const PACKUMENT = {
  'dist-tags': { latest: '2.0.0' },
  name: 'widget',
  time: {
    '1.0.0': '2024-01-01T00:00:00.000Z',
    '2.0.0': '2024-06-01T00:00:00.000Z',
  },
  versions: { '1.0.0': { dist: {} }, '2.0.0': { dist: {} } },
}

/**
 * Bundle the npm metadata browser twin and run it process-less, returning what
 * was observed rather than asserting it.
 *
 * The fixture imports the BARE `./npm/meta` and `./npm/meta-cache` subpaths, so
 * observing anything at all is the proof that `bundle`'s resolver picked the
 * browser twin over the cacache-backed Node half.
 */
async function observeNpmMetaTwin(
  bundle: WebBundler,
  filename: string,
): Promise<Record<string, unknown>> {
  const result = await bundle({
    entry: entryNpmMeta,
    filename,
    library: 'socketLibNpmMetaE2e',
  })
  if (result.errors) {
    return { errors: result.errors }
  }
  // The fetch family is here because the bundled default HTTP adapter
  // touches `Headers` and `URLSearchParams` at module-evaluation time.
  // Every one of these is a global a real browser always supplies, so
  // requiring them is honest; `process` and `require` remain absent,
  // which is the actual claim.
  const bundled = runInBareContext<{
    run(packument: unknown): Promise<{
      batchLength: number
      fetches: number
      latest: string
      name: string
      versions: string[]
    }>
    runWithWebStorage(packument: unknown): Promise<{
      fetches: number
      name: string
      storedKeys: boolean
    }>
  }>(result.source, 'socketLibNpmMetaE2e', {
    AbortController,
    Headers,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    fetch,
  })
  return {
    errors: undefined,
    run: await bundled.run(PACKUMENT),
    webStorage: await bundled.runWithWebStorage(PACKUMENT),
  }
}

/**
 * What {@link observeNpmMetaTwin} must observe under every bundler.
 */
const NPM_META_TWIN = {
  errors: undefined,
  run: {
    batchLength: 2,
    // One upstream call for four reads — the injected cache deduped the
    // rest, which is the whole reason this module has a cache tier.
    fetches: 1,
    latest: '2.0.0',
    name: 'widget',
    versions: ['1.0.0', '2.0.0'],
  },
  // A second cache over the same Web Storage reads the first one's entry,
  // so the durable tier survives what a page reload would destroy.
  webStorage: { fetches: 1, name: 'widget', storedKeys: true },
}

describe('browser-bundle e2e', () => {
  it(
    'webpack bundles the lib for target:web (node builtins stubbed)',
    async () => {
      const result = await bundleForWeb({ entry, filename: 'bundle.js' })
      expect(result.errors).toBeUndefined()
      expect(existsSync(result.outFile)).toBe(true)
    },
    tolerantTimeout(120_000),
  )

  it(
    'debug/output + memo/async load and run in a process-less vm context',
    async () => {
      const result = await bundleForWeb({
        entry: entryDebug,
        filename: 'debug-bundle.js',
        library: 'socketLibBrowserE2e',
      })
      expect(result.errors).toBeUndefined()

      const bundled = runInBareContext<{
        run(): Promise<{
          a: number
          b: number
          cached: number
          calls: number
          debugLogThrew: boolean
        }>
      }>(result.source, 'socketLibBrowserE2e')
      expect(await bundled.run()).toEqual({
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
      const result = await bundleForWeb({
        entry: entryBuiltinAi,
        filename: 'language-model-bundle.js',
        library: 'socketLibLanguageModelE2e',
      })
      expect(result.errors).toBeUndefined()

      const browserFactory = {
        availability: async () => 'available',
        create: async () => Object.create(null),
      }
      const bundled = runInBareContext<{ getFactory(): unknown }>(
        result.source,
        'socketLibLanguageModelE2e',
        { LanguageModel: browserFactory },
      )
      expect(bundled.getFactory()).toBe(browserFactory)
    },
    tolerantTimeout(120_000),
  )

  it(
    'npm/registry module evaluates and runs in a process-less vm context',
    async () => {
      const result = await bundleForWeb({
        entry: entryNpm,
        filename: 'npm-bundle.js',
        library: 'socketLibNpmE2e',
      })
      expect(result.errors).toBeUndefined()

      const bundled = runInBareContext<{
        run(): {
          cdnEncoded: string
          cdnPath: string
          name: string
          noAttestation: boolean
          registryEncoded: string
          withAttestation: boolean
        }
      }>(result.source, 'socketLibNpmE2e')
      expect(bundled.run()).toEqual({
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

  it(
    'npm tarball browser twin gunzips and untars in a process-less vm context',
    async () => {
      expect(
        await observeNpmTarballTwin(bundleForWeb, 'npm-tarball-bundle.js'),
      ).toEqual(NPM_TARBALL_TWIN)
    },
    tolerantTimeout(120_000),
  )

  it(
    'npm metadata client resolves its browser twin and runs in a process-less vm context',
    async () => {
      expect(
        await observeNpmMetaTwin(bundleForWeb, 'npm-meta-bundle.js'),
      ).toEqual(NPM_META_TWIN)
    },
    tolerantTimeout(120_000),
  )

  // esbuild is a pinned devDependency, so this block is unconditional. A
  // second resolver over the same exports map is the point: it re-proves the
  // browser twins independently of webpack's resolution.
  describe('esbuild', () => {
    it(
      'bundles the lib for platform:browser (node builtins stubbed)',
      async () => {
        const result = await bundleForWebWithEsbuild({
          entry,
          filename: 'bundle.js',
        })
        expect(result.errors).toBeUndefined()
        expect(existsSync(result.outFile)).toBe(true)
      },
      tolerantTimeout(120_000),
    )

    it(
      'npm tarball browser twin gunzips and untars in a process-less vm context',
      async () => {
        expect(
          await observeNpmTarballTwin(
            bundleForWebWithEsbuild,
            'npm-tarball-esbuild.js',
          ),
        ).toEqual(NPM_TARBALL_TWIN)
      },
      tolerantTimeout(120_000),
    )

    it(
      'npm metadata client resolves its browser twin and runs in a process-less vm context',
      async () => {
        expect(
          await observeNpmMetaTwin(
            bundleForWebWithEsbuild,
            'npm-meta-esbuild.js',
          ),
        ).toEqual(NPM_META_TWIN)
      },
      tolerantTimeout(120_000),
    )
  })
})

/**
 * @file Rolldown configuration for external-package bundling. Each external is
 *   a real `bundle: true` build (one entry → one self-contained CJS file under
 *   `dist/external/`), unlike the per-file main source build. Ports the two
 *   esbuild plugins to rolldown plugin hooks: `force-node-modules` (a
 *   `resolveId` hook that bypasses tsconfig path mappings to break circular
 *   self-references) and `stub-modules` (a `resolveId` + `load` pair that swaps
 *   unreachable dependencies for stub files).
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Plugin, RolldownOptions } from 'rolldown'

import { defineGuardedPlugin } from '../../.config/repo/rolldown/define-guarded.mts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stubsDir = path.join(__dirname, 'stubs')

const requireResolve = createRequire(import.meta.url)

/**
 * Stub configuration — maps module patterns to stub files. Only includes
 * conservative stubs that are safe to use.
 *
 * SAFETY NOTE for the Arborist-reachable stubs below: we use Arborist via
 * `safeIdealTree` (buildIdealTree + reify in packageLockOnly mode) and
 * `safeReify` only. We never call `arb.audit()` (→ metavuln-calculator →
 * sigstore/tuf) nor `arb.query(...)` (→ @npmcli/query →
 * postcss-selector-parser). If a future caller needs those code paths, drop the
 * corresponding entry from STUB_MAP.
 *
 * Each entry may be a bare stub filename (matches against the resolved
 * specifier only) or a tuple `[importerPattern, stubFilename]` to require the
 * importer to also match (used to scope relative-path stubs to a package).
 */
const STUB_MAP: Record<string, string | [RegExp, string]> = {
  '^@npmcli/metavuln-calculator$': 'empty.cjs',
  '^@npmcli/query$': 'empty.cjs',
  '^@npmcli/node-gyp$': 'npmcli-node-gyp.cjs',
  '^@sigstore/(bundle|core|protobuf-specs|sign|tuf|verify)$': 'empty.cjs',
  '^@tufjs/(canonical-json|models)$': 'empty.cjs',
  '^(encoding|iconv-lite)$': 'encoding.cjs',
  '^postcss-selector-parser$': 'empty.cjs',
  '^proggy$': 'proggy.cjs',
  '^sigstore$': 'empty.cjs',
  '^tuf-js$': 'empty.cjs',
  '^\\.\\./audit-report\\.js$': [
    /@npmcli[\\/]arborist[\\/]lib[\\/]arborist[\\/]/,
    'arborist-audit-report.cjs',
  ],
  '^\\./yarn-lock\\.js$': [
    /@npmcli[\\/]arborist[\\/]lib[\\/]/,
    'arborist-yarn-lock.cjs',
  ],
  '^\\./isolated-reifier\\.js$': [
    /@npmcli[\\/]arborist[\\/]lib[\\/]arborist[\\/]/,
    'arborist-isolated-reifier.cjs',
  ],
  '^\\./query-selector-all\\.js$': [
    /@npmcli[\\/]arborist[\\/]lib[\\/]/,
    'arborist-query-selector-all.cjs',
  ],
  '^\\./printable\\.js$': [
    /@npmcli[\\/]arborist[\\/]lib[\\/]/,
    'arborist-printable.cjs',
  ],
  '^\\./verify\\.js$': [/cacache[\\/]lib[\\/]/, 'empty.cjs'],
  '^\\./browser\\.js$': [/debug[\\/]src[\\/]/, 'empty.cjs'],
}

/**
 * Force npm packages to resolve from node_modules so tsconfig.json path
 * mappings (e.g. `"cacache": ["./src/external/cacache"]`) can't redirect a
 * bundled external back into its own source wrapper and create a circular
 * self-reference. Ported from the esbuild `onResolve` plugin to a rolldown
 * `resolveId` hook: returning a resolved absolute id with `external: false`
 * pins resolution to the installed copy.
 */
export function createForceNodeModulesPlugin(): Plugin {
  const packagesWithPathMappings = [
    'adm-zip',
    'cacache',
    'make-fetch-happen',
    'fast-sort',
    'p-map',
    'pacote',
    'tar-fs',
    'libnpmexec',
    'libnpmpack',
    'npm-package-arg',
    'normalize-package-data',
  ]
  const matchers = packagesWithPathMappings.map(pkg => ({
    pkg,
    re: new RegExp(`^${pkg}(/|$)`),
  }))

  return {
    name: 'force-node-modules',
    resolveId(source, importer) {
      // Already inside node_modules — let rolldown's resolver handle it.
      if (importer && importer.includes('node_modules')) {
        return undefined
      }
      const match = matchers.find(m => m.re.test(source))
      if (!match) {
        return undefined
      }
      try {
        return { id: requireResolve.resolve(source), external: false }
      } catch {
        // require.resolve fails for ESM-only packages; resolve the
        // package.json and derive the entry point instead.
        try {
          const pkgJsonPath = requireResolve.resolve(
            `${match.pkg}/package.json`,
          )
          const pkgDir = path.dirname(pkgJsonPath)
          const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
            exports?: string | { default?: string } | undefined
            main?: string | undefined
            module?: string | undefined
          }
          const exportsField = pkgJson.exports
          const entry =
            typeof exportsField === 'string'
              ? exportsField
              : (exportsField?.default ?? pkgJson.module ?? pkgJson.main)
          if (entry) {
            return { id: path.resolve(pkgDir, entry), external: false }
          }
        } catch {}
        return undefined
      }
    },
  }
}

/**
 * Stub modules with files from `stubs/`. Ported from the esbuild
 * `onResolve`/`onLoad` namespace pattern to a rolldown `resolveId` + `load`
 * pair: `resolveId` tags a matched specifier with a synthetic `\0stub:<file>`
 * id; `load` returns that stub's contents for the synthetic id.
 */
export function createStubPlugin(
  stubMap: Record<string, string | [RegExp, string]> = STUB_MAP,
): Plugin {
  const stubs = Object.entries(stubMap).map(([pattern, value]) => {
    const [importerFilter, filename] = Array.isArray(value)
      ? value
      : [undefined, value]
    return {
      filter: new RegExp(pattern),
      importerFilter,
      contents: readFileSync(path.join(stubsDir, filename), 'utf8'),
      stubFile: filename,
    }
  })
  const prefix = '\0stub:'

  return {
    name: 'stub-modules',
    resolveId(source, importer) {
      for (const { filter, importerFilter, stubFile } of stubs) {
        if (!filter.test(source)) {
          continue
        }
        if (importerFilter && (!importer || !importerFilter.test(importer))) {
          continue
        }
        return { id: `${prefix}${stubFile}` }
      }
      return undefined
    },
    load(id) {
      if (!id.startsWith(prefix)) {
        return undefined
      }
      const stubFile = id.slice(prefix.length)
      const stub = stubs.find(s => s.stubFile === stubFile)
      return stub ? stub.contents : undefined
    },
  }
}

// node: builtins + the registry-stable self-reference are never bundled into
// the externals; the consuming dist resolves them at runtime.
const BUILTIN_EXTERNALS = [
  '@socketsecurity/registry-stable',
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'perf_hooks',
  'querystring',
  'stream',
  'string_decoder',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
]

interface PackageOpts {
  external?: string[] | undefined
  define?: Record<string, string> | undefined
  banner?: string | undefined
  footer?: string | undefined
  plugins?: Plugin[] | undefined
}

/**
 * Build the rolldown config for one external package.
 */
export function getRolldownConfig(
  entryPoint: string,
  outfile: string,
  packageOpts: PackageOpts = {},
): RolldownOptions {
  const externals = [...BUILTIN_EXTERNALS, ...(packageOpts.external || [])]
  // `pkg/*` entries externalize the whole subtree (prefix match); bare
  // entries match exactly. `pkg/*` mirrors esbuild's wildcard external.
  const exactExternals = new Set(externals.filter(e => !e.endsWith('/*')))
  const prefixExternals = externals
    .filter(e => e.endsWith('/*'))
    .map(e => e.slice(0, -1))
  return {
    input: entryPoint,
    platform: 'node',
    external: (id: string) =>
      id.startsWith('node:') ||
      exactExternals.has(id) ||
      prefixExternals.some(p => id.startsWith(p)),
    plugins: [
      createForceNodeModulesPlugin(),
      createStubPlugin(),
      // Guarded define for dead-code elimination. Read-only substitution —
      // assignment targets and `delete` operands are left alone, so e.g.
      // `delete process.env.DEBUG` (debug's node.js save()) stays verbatim
      // instead of becoming the strict-mode-illegal `delete undefined`. Plain
      // `transform.define` / @rollup/plugin-replace can't guard `delete`.
      defineGuardedPlugin({
        'process.env.NODE_ENV': '"production"',
        __DEV__: 'false',
        'global.GENTLY': 'false',
        'process.env.DEBUG': 'undefined',
        'process.browser': 'false',
        'process.env.VERBOSE': 'false',
        window: 'undefined',
        document: 'undefined',
        navigator: 'undefined',
        HTMLElement: 'undefined',
        localStorage: 'undefined',
        sessionStorage: 'undefined',
        XMLHttpRequest: 'undefined',
        WebSocket: 'undefined',
        __TEST__: 'false',
        'process.env.CI': 'false',
        __JEST__: 'false',
        __MOCHA__: 'false',
        'process.env.JEST_WORKER_ID': 'undefined',
        'process.env.NODE_TEST': 'undefined',
        ...packageOpts.define,
      }),
      ...(packageOpts.plugins || []),
    ],
    output: {
      file: outfile,
      format: 'cjs',
      minify: false,
      sourcemap: false,
      // Single self-contained file per external. Disable code-splitting so
      // dynamic imports inline into one chunk and `output.file` is valid
      // (matches esbuild's single-outfile bundle).
      codeSplitting: false,
      // Preserve function/class .name for readable runtime errors (esbuild
      // keepNames:true). OutputOptions field, not top-level.
      keepNames: true,
      banner: packageOpts.banner ?? '"use strict";',
      ...(packageOpts.footer ? { footer: packageOpts.footer } : {}),
    },
  }
}

/**
 * Get package-specific rolldown options.
 */
export function getPackageSpecificOptions(packageName: string): PackageOpts {
  const opts: PackageOpts = {}

  if (packageName === 'browserslist') {
    opts.define = { 'process.versions.node': '"18.0.0"' }
  } else if (packageName === '@socketregistry/packageurl-js-stable') {
    // packageurl-js imports from socket-lib, creating a circular dependency.
    // Mark socket-lib imports as external to avoid bundling issues.
    opts.external = [...(opts.external || []), '@socketsecurity/lib-stable/*']
  } else if (packageName === 'yargs-parser') {
    // yargs-parser uses import.meta.url, unavailable in CommonJS output.
    // Rewrite it to __filename.
    opts.define = { ...opts.define, 'import.meta.url': '__filename' }
  }

  return opts
}

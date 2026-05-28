/**
 * @file Update registry package.json with exports, browser fields, and Node.js
 *   engine range.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import builtinNames from '@socketregistry/packageurl-js-stable/data/npm/builtin-names.json' with { type: 'json' }
import fastGlob from 'fast-glob'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { toSortedObject } from '@socketsecurity/lib-stable/objects/sort'
import { readPackageJson } from '@socketsecurity/lib-stable/packages/operations'

const logger = getDefaultLogger()

// Helper to write package.json with proper formatting
export async function writePackageJson(filePath, data) {
  const content = `${JSON.stringify(data, null, 2)}\n`
  await fs.writeFile(filePath, content, 'utf8')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Constants for socket-lib
const constants = {
  EXT_JSON: '.json',
  registryPkgPath: path.join(__dirname, '..', '..'),
  ignoreGlobs: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/coverage/**',
    '**/coverage-isolated/**',
    '**/.cache/**',
    '**/tmp/**',
    '**/.DS_Store',
  ],
  PACKAGE_DEFAULT_NODE_RANGE: '>=22',
}

const { EXT_JSON } = constants

/**
 * Generate exports and browser fields for registry package.
 */
async function main(): Promise<void> {
  const { registryPkgPath } = constants
  const registryPkgJsonPath = path.join(registryPkgPath, 'package.json')

  const registryPkgJsonData = await readPackageJson(registryPkgJsonPath)

  // Create editable wrapper.
  const registryEditablePkgJson = {
    content: registryPkgJsonData,
    save: async function () {
      await writePackageJson(registryPkgJsonPath, this.content)
    },
    update: function (updates) {
      Object.assign(this.content, updates)
    },
  }

  const registryPkgJson = registryEditablePkgJson.content

  const browser = { ...registryPkgJson.browser }
  for (const builtinName of builtinNames) {
    browser[builtinName] = false
  }

  const registryPkgFiles = [
    ...(await fastGlob.glob(['**/*.{cjs,js,mjs,json,d.ts,d.mts,d.cts}'], {
      cwd: registryPkgPath,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/coverage/**',
        '**/coverage-isolated/**',
        '**/.cache/**',
        '**/tmp/**',
        '**/.DS_Store',
        'dist/external/**',
        'scripts/**',
        'src/**',
        // tools/ and vendor/ are workspace packages for internal use,
        // not public exports of @socketsecurity/lib-stable.
        'tools/**',
        'vendor/**',
        // Files / directories prefixed with `_` are private helpers, not
        // public API. Two patterns: `dist/**/_*` catches underscore-prefixed
        // leaves at any depth; `dist/_*/**` catches underscore-prefixed
        // directories sitting directly under `dist/` (e.g. rolldown's
        // `_virtual/_rolldown/runtime.js` shared-runtime artifact under
        // preserveModules), which the first pattern misses.
        'dist/**/_*',
        'dist/_*/**',
      ],
      gitignore: false,
    })),
  ]

  const isDebug = !!process.env.DEBUG
  if (isDebug) {
    logger.log('Found', registryPkgFiles.length, 'files')
    logger.log('First 10:', registryPkgFiles.slice(0, 10))
  }

  // Build the set of source files once so we can emit a `source` export
  // condition only when the corresponding `src/<path>.ts` exists. The
  // `source` condition lets vitest (which sets `conditions: ['source']`)
  // resolve `@socketsecurity/lib-stable/<subpath>` to `src/*.ts` for accurate
  // coverage attribution; production / consumer resolves still land on
  // `default` (the dist build).
  const srcRoot = path.join(registryPkgPath, 'src')
  const srcFiles = new Set<string>(
    await fastGlob.glob(['**/*.{ts,mts,cts}'], {
      cwd: srcRoot,
      ignore: ['**/*.d.ts', 'external/**'],
      gitignore: false,
    }),
  )

  const jsonExports = {}
  // Detect declaration files with their full compound extension so the
  // public path strips `.d.ts` / `.d.mts` / `.d.cts` and the
  // `types` condition points at the right artifact.
  const detectExt = (p: string): string => {
    if (p.endsWith('.d.ts')) {
      return '.d.ts'
    }
    if (p.endsWith('.d.mts')) {
      return '.d.mts'
    }
    if (p.endsWith('.d.cts')) {
      return '.d.cts'
    }
    return path.extname(p)
  }
  const isDtsExt = (ext: string): boolean =>
    ext === '.d.ts' || ext === '.d.mts' || ext === '.d.cts'
  const subpathExports = registryPkgFiles.reduce((o, p) => {
    const ext = detectExt(p)
    // Strip 'dist/' prefix from export path but keep it in file path.
    const exportPath = p.startsWith('dist/') ? p.slice(5) : p
    const filePath = `./${p}`

    if (ext === EXT_JSON) {
      jsonExports[`./${exportPath}`] = filePath
    } else {
      const isDts = isDtsExt(ext)
      const basename = path.basename(exportPath, ext)
      // For index files, expose only the directory path (e.g., './themes'),
      // not the redundant './themes/index' form.
      let publicPath: string
      if (basename === 'index') {
        const dirname = path.dirname(exportPath)
        publicPath = dirname === '.' ? '.' : `./${dirname}`
      } else {
        publicPath = `./${exportPath.slice(0, -ext.length)}`
      }
      // Resolve a matching source file for the `source` condition.
      // Only emit it when the file actually exists — some dist files
      // (re-exports, generated bundles) have no `src` twin.
      let sourcePath: string | undefined
      if (!isDts && p.startsWith('dist/')) {
        const distRel = p.slice(5).slice(0, -ext.length)
        for (const candidate of [
          `${distRel}.ts`,
          `${distRel}.mts`,
          `${distRel}.cts`,
        ]) {
          if (srcFiles.has(candidate)) {
            sourcePath = `./src/${candidate}`
            break
          }
        }
      }
      if (o[publicPath]) {
        o[publicPath][isDts ? 'types' : 'default'] = filePath
        if (sourcePath && !o[publicPath].source) {
          o[publicPath].source = sourcePath
        }
      } else {
        o[publicPath] = {
          // Order is significant: `source` first (most specific dev
          // condition), then `types`, then `default` last.
          source: sourcePath,
          types: isDts ? filePath : undefined,
          default: isDts ? undefined : filePath,
        }
      }
    }
    return o
  }, {})

  // Browser-safe subpath prefixes — modules with zero Node-built-in
  // imports (audited per docs/browser-compatibility.md). Bundlers that
  // resolve the `browser` export condition (rolldown, vite, esbuild
  // with platform: 'browser') will pick the same files as the default
  // condition — the conditional's purpose is to SIGNAL that the entry
  // is safe, not to route to alternate code.
  //
  // Browser-incompatible modules (fs, archives, bin, ...) deliberately
  // omit the condition. Modules with a dedicated browser implementation
  // (./logger, ./http-request) carry an explicit `browser` condition
  // pointing at the alternate file — those are added by the dedicated
  // section below, NOT by this loop.
  const BROWSER_SAFE_PREFIXES = [
    './arrays/',
    './colors/',
    './errors/',
    './objects/',
    './regexps/',
    './strings/',
    './url/',
    './versions/',
    './words/',
  ]
  // Any leaf whose path ends in `/browser` or `/browser-fetch` IS the
  // browser implementation — it's browser-safe by construction, so it
  // carries the `browser` condition pointing at itself. Otherwise
  // `./logger/browser` (the explicit browser entry) would lack the
  // condition that `./logger` (via the alias) routes to, which makes
  // the alias-routing strictly stronger than the explicit-entry route.
  const isExplicitBrowserLeaf = (p: string): boolean =>
    p.endsWith('/browser') || p.endsWith('/browser-fetch')
  for (const { 0: exportPath, 1: exportValue } of Object.entries(
    subpathExports,
  )) {
    if (
      !BROWSER_SAFE_PREFIXES.some(p => exportPath.startsWith(p)) &&
      !isExplicitBrowserLeaf(exportPath)
    ) {
      continue
    }
    if (
      exportValue &&
      typeof exportValue === 'object' &&
      !('browser' in exportValue)
    ) {
      // Splice `browser` in BEFORE the other conditions per the
      // node-conditions-order convention (most-specific first).
      const { source, types, default: def } = exportValue
      const next: Record<string, unknown> = {
        browser: { source, types, default: def },
      }
      for (const { 0: k, 1: v } of Object.entries(exportValue)) {
        next[k] = v
      }
      subpathExports[exportPath] = next
    }
  }

  // Add kebab-case variants for all SCREAMING_SNAKE_CASE constant paths.
  // Map both kebab-case and SCREAMING_SNAKE_CASE paths to the same files.
  const aliasesToAdd = []
  for (const { 0: exportPath, 1: exportValue } of Object.entries(
    subpathExports,
  )) {
    if (
      exportPath.startsWith('./lib/constants/') &&
      exportPath !== './lib/constants'
    ) {
      const pathAfterConstants = exportPath.slice('./lib/constants/'.length)

      // Check if this is a SCREAMING_SNAKE_CASE name.
      if (
        pathAfterConstants.includes('_') &&
        /[A-Z]/.test(pathAfterConstants)
      ) {
        // Create kebab-case variant.
        const kebabCasePath = `./lib/constants/${pathAfterConstants.toLowerCase().replace(/_/g, '-')}`
        if (!subpathExports[kebabCasePath]) {
          aliasesToAdd.push([kebabCasePath, exportValue])
        }
      }

      // Check if this is a kebab-case name.
      if (
        pathAfterConstants.includes('-') &&
        pathAfterConstants === pathAfterConstants.toLowerCase()
      ) {
        // Create SCREAMING_SNAKE_CASE variant.
        const screamingSnakeCasePath = `./lib/constants/${pathAfterConstants.toUpperCase().replace(/-/g, '_')}`
        if (!subpathExports[screamingSnakeCasePath]) {
          aliasesToAdd.push([screamingSnakeCasePath, exportValue])
        }
      }
    }
  }

  // Add all aliases after iteration completes.
  for (const { 0: aliasPath, 1: aliasValue } of aliasesToAdd) {
    subpathExports[aliasPath] = aliasValue
  }

  // Fleet-compat barrel aliases. The fleet's socket-wheelhouse template
  // imports getDefaultLogger from '@socketsecurity/lib-stable/logger' and
  // errorMessage from '@socketsecurity/lib-stable/errors'. socket-lib's own
  // public surface no longer ships top-level barrel modules — every leaf
  // is its own subpath — so we expose these two as exports-map aliases
  // that point at the canonical primary subpath. Source-level barrels
  // would violate the "no barrel files" CLAUDE.md rule; an exports-map
  // alias is just a re-pointer with no source file behind it.
  const fleetCompatAliases: Array<[string, string]> = [
    // Bare `./logger` and explicit `./logger/logger` both give consumers
    // the `Logger` class (auto-routed by the 'browser' condition below).
    // The singleton accessor lives at `./logger/default`.
    ['./logger', './logger/node'],
    ['./logger/logger', './logger/node'],
    ['./http-request', './http-request/node'],
    ['./http-request/http-request', './http-request/node'],
    ['./errors', './errors/message'],
  ]
  // Alias targets that have a dedicated browser implementation. When a
  // bundler resolves the 'browser' condition on the alias, send it to
  // the browser leaf instead of the Node default. Without this, browser
  // consumers silently pull in node:* builtins via the Node-side default.
  const fleetCompatBrowserSource: Record<string, string> = {
    './logger': './logger/browser',
    './logger/logger': './logger/browser',
    './http-request': './http-request/browser',
    './http-request/http-request': './http-request/browser',
  }
  // Alias keys may already exist (e.g. `./logger/logger` resolves to a real
  // source file `src/logger/logger.ts` that's just a 1-line re-export of
  // `./node`). The alias-routing version is strictly better than the
  // self-resolution, so unconditionally overwrite.
  for (const { 0: alias, 1: target } of fleetCompatAliases) {
    const targetValue = subpathExports[target]
    if (targetValue) {
      const browserTargetKey = fleetCompatBrowserSource[alias]
      const browserTarget = browserTargetKey
        ? subpathExports[browserTargetKey]
        : undefined
      if (
        browserTarget &&
        typeof browserTarget === 'object' &&
        typeof targetValue === 'object'
      ) {
        // Splice `browser` BEFORE the other conditions (most-specific first).
        const {
          source,
          types,
          default: def,
        } = targetValue as Record<string, unknown>
        const browserDef = browserTarget as Record<string, unknown>
        const next: Record<string, unknown> = {
          source,
          browser: {
            types: browserDef.types,
            default: browserDef.default,
          },
          types,
          default: def,
        }
        subpathExports[alias] = next
      } else {
        subpathExports[alias] = targetValue
      }
    }
  }

  // Create exports object with proper ordering:
  // 1. Main exports (. and ./index)
  // 2. SCREAMING_SNAKE_CASE constants
  // 3. kebab-case constants
  // 4. Non-constants lib exports
  // 5. JSON files
  const mainExports = {}
  const jsonExports2 = {}
  const libExports = {}
  const screamingSnakeCaseExports = {}
  const kebabCaseExports = {}

  for (const { 0: key, 1: value } of Object.entries({
    ...subpathExports,
    ...jsonExports,
  })) {
    if (key === '.' || key === './index') {
      mainExports[key] = value
    } else if (key.endsWith('.json')) {
      jsonExports2[key] = value
    } else if (key.startsWith('./lib/constants/')) {
      const pathAfterConstants = key.slice('./lib/constants/'.length)
      // SCREAMING_SNAKE_CASE paths contain _ or start with uppercase
      if (
        pathAfterConstants.includes('_') ||
        /^[A-Z]/.test(pathAfterConstants)
      ) {
        screamingSnakeCaseExports[key] = value
      } else {
        kebabCaseExports[key] = value
      }
    } else {
      // Non-constants lib paths
      libExports[key] = value
    }
  }

  // Ensure . comes before ./index
  const sortedMainExports = {}
  if (mainExports['.']) {
    sortedMainExports['.'] = mainExports['.']
  }
  if (mainExports['./index']) {
    sortedMainExports['./index'] = mainExports['./index']
  }

  const exports = {
    ...sortedMainExports,
    ...toSortedObject(screamingSnakeCaseExports),
    ...toSortedObject(kebabCaseExports),
    ...toSortedObject(libExports),
    ...toSortedObject(jsonExports2),
  }

  registryEditablePkgJson.update({
    browser: toSortedObject(browser),
    exports,
    engines: {
      ...registryEditablePkgJson.content.engines,
      node: constants.PACKAGE_DEFAULT_NODE_RANGE,
    },
  })
  await registryEditablePkgJson.save()
}

main().catch(error => {
  logger.error(error.message || error)
  process.exitCode = 1
})

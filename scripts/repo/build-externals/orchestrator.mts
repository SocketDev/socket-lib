/**
 * @file Main entry point for bundling external dependencies. Orchestrates
 *   bundling and reporting.
 */

import { promises as fs } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'
import { DIST_EXTERNAL_DIR, SRC_EXTERNAL_DIR } from '../paths.mts'
import { bundlePackage } from './bundler.mts'
import { externalPackages, scopedPackages } from './config.mts'
import { copyLocalFiles, ensureDir } from './copy-files.mts'
import { transformPrimordials } from './transform-primordials.mts'

const logger = getDefaultLogger()

const rootDir = REPO_ROOT

/**
 * Main build function.
 *
 * @param {object} options - Build options.
 * @param {boolean} options.verbose - Show detailed output.
 * @param {boolean} options.quiet - Suppress all output.
 *
 * @returns {Promise<void>}
 */
export async function buildExternals(
  options: { quiet?: boolean | undefined; verbose?: boolean | undefined } = {},
) {
  const { quiet = false, verbose = false } = options

  // Default behavior: show header but not individual packages (concise)
  // --verbose: show all package details
  // --quiet: show nothing
  const showDetails = verbose && !quiet

  // Ensure dist/external directory exists.
  await ensureDir(DIST_EXTERNAL_DIR)

  // Bundle all packages
  const { bundledCount, totalSize } = await bundleAllPackages({
    quiet: quiet || !showDetails,
  })

  // Post-process: Fix node-gyp strings to prevent bundler issues for consumers
  await fixNodeGypStrings(DIST_EXTERNAL_DIR, { quiet })

  // Post-process: rewrite `require("node:X")` to the bare builtin form so
  // browser bundlers can stub the specifier via the package.json `browser`
  // field (webpack throws UnhandledSchemeError on the `node:` scheme before
  // the stubs apply — same doctrine as src/node/module.ts's bare `module`).
  await rewriteBareBuiltinRequires(DIST_EXTERNAL_DIR, { quiet })

  // Post-process: rewrite well-known global calls (Buffer.from, Date.now,
  // Object.keys, …) to socket-lib's primordials surface so the bundled
  // externals don't depend on a clean caller realm. The codemod has a
  // built-in workaround for the acorn-wasm parser's range-serialization
  // bug (it repairs broken `end` positions by walking children, and
  // scans source for the closing `)` when the call's outer end is
  // unreliable — see tools/prim/src/codemod.mts).
  const distRoot = path.dirname(DIST_EXTERNAL_DIR)
  await transformPrimordials(distRoot, DIST_EXTERNAL_DIR, { quiet })

  // Ship hand-authored .d.ts stubs (e.g. src/external/std-env.d.ts) next to the
  // bundled .js so public re-exports of an external's type surface resolve for
  // consumers — an inlined devDependency has no downstream types otherwise. Runs
  // last so the .js-only transform passes above never parse a .d.ts.
  await copyLocalFiles(SRC_EXTERNAL_DIR, DIST_EXTERNAL_DIR, {
    quiet: quiet || !showDetails,
  })

  return { __proto__: null, bundledCount, totalSize }
}

/**
 * Bundle all external packages.
 *
 * @param {object} options - Options.
 * @param {boolean} options.quiet - Suppress individual package output.
 *
 * @returns {Promise<{ bundledCount: number; totalSize: number }>}
 */
export async function bundleAllPackages(
  options: { quiet?: boolean | undefined } = {},
) {
  const { quiet = false } = options
  let bundledCount = 0
  let totalSize = 0

  // Bundle each external package or copy non-bundled files.
  for (const { bundle, name } of externalPackages) {
    if (bundle) {
      const outputPath = path.join(DIST_EXTERNAL_DIR, `${name}.js`)
      const size = await bundlePackage(name, outputPath, rootDir, {
        quiet,
      })
      if (size) {
        bundledCount++
        totalSize += size
      }
    } else {
      // Copy the non-bundled thin re-export wrapper as-is.
      const srcPath = path.join(SRC_EXTERNAL_DIR, `${name}.js`)
      const destPath = path.join(DIST_EXTERNAL_DIR, `${name}.js`)
      await fs.copyFile(srcPath, destPath)
    }
  }

  // Bundle scoped packages.
  for (const {
    bundle,
    name,
    optional,
    packages,
    scope,
    subpaths,
  } of scopedPackages) {
    const scopeDir = path.join(DIST_EXTERNAL_DIR, scope)
    await ensureDir(scopeDir)

    for (const packageName of name ? [name] : (packages ?? [])) {
      const size = await bundleScopedPackage(scope, packageName, {
        bundle,
        optional,
        quiet,
      })
      if (size) {
        bundledCount++
        totalSize += size
      }
    }

    // Bundle subpath exports (e.g., @npmcli/package-json/lib/read-package)
    if (subpaths) {
      for (const subpath of subpaths) {
        // Output file always ends in .js. Subpath may already include it
        // (e.g. '@npmcli/package-json/lib/read-package.js' — the package's
        // own exports map uses that literal path) or omit it (e.g.
        // '@sinclair/typebox/value' — exports map uses './value', so the
        // subpath can't include .js or resolve will fail).
        const outFilename = subpath.endsWith('.js') ? subpath : `${subpath}.js`
        const outputPath = path.join(DIST_EXTERNAL_DIR, scope, outFilename)
        const packageName = `${scope}/${subpath}`
        // Ensure parent directory exists
        await ensureDir(path.dirname(outputPath))
        const size = await bundlePackage(packageName, outputPath, rootDir, {
          quiet,
        })
        if (size) {
          bundledCount++
          totalSize += size
        }
      }
    }
  }

  return { __proto__: null, bundledCount, totalSize }
}

/**
 * Post-process bundled files to break node-gyp require.resolve strings. This
 * prevents consumers trying to bundle socket-lib from having issues with
 * node-gyp.
 *
 * @param {string} dir - Directory to process.
 * @param {object} options - Options.
 * @param {boolean} options.quiet - Suppress output.
 */
export async function fixNodeGypStrings(
  dir: string,
  options: { quiet?: boolean | undefined } = {},
) {
  const { quiet = false } = options

  // Find all .js files in dist/external
  const files = await fs.readdir(dir, { withFileTypes: true })

  for (const file of files) {
    const filePath = path.join(dir, file.name)

    if (file.isDirectory()) {
      // Recursively process subdirectories
      await fixNodeGypStrings(filePath, options)
    } else if (file.name.endsWith('.js')) {
      // Read file contents
      const contents = await fs.readFile(filePath, 'utf8')

      // Check if file contains the problematic pattern
      if (contents.includes('node-gyp/bin/node-gyp.js')) {
        // Replace literal string with concatenated version
        const fixed = contents.replace(
          /["']node-gyp\/bin\/node-gyp\.js["']/g,
          '"node-" + "gyp/bin/node-gyp.js"',
        )

        await fs.writeFile(filePath, fixed, 'utf8')

        if (!quiet) {
          logger.log(
            `  Fixed node-gyp string in ${path.relative(path.join(dir, '..', '..'), filePath)}`,
          )
        }
      }
    }
  }
}

// Builtins that resolve in BOTH bare and node:-prefixed form. `node:`-only
// builtins (node:test, node:sqlite, …) appear in builtinModules WITH the
// prefix and must keep it — their bare form doesn't resolve.
const dualFormBuiltins = new Set(builtinModules)

/**
 * Post-process bundled files to rewrite `require("node:X")` into
 * `require("X")` when the bare form is also a builtin. Browser bundlers
 * (webpack) throw UnhandledSchemeError on `node:` specifiers before the
 * package.json `browser`-field stubs can apply; bare builtin specifiers
 * resolve identically on Node and stay stubbable.
 *
 * @param {string} dir - Directory to process.
 * @param {object} options - Options.
 * @param {boolean} options.quiet - Suppress output.
 */
export async function rewriteBareBuiltinRequires(
  dir: string,
  options: { quiet?: boolean | undefined } = {},
) {
  const { quiet = false } = options

  const files = await fs.readdir(dir, { withFileTypes: true })

  for (const file of files) {
    const filePath = path.join(dir, file.name)

    if (file.isDirectory()) {
      // Recursively process subdirectories
      await rewriteBareBuiltinRequires(filePath, options)
    } else if (file.name.endsWith('.js')) {
      const contents = await fs.readFile(filePath, 'utf8')
      if (!contents.includes('node:')) {
        continue
      }
      let rewrites = 0
      // Matches require("node:X") / require('node:X'): (["']) captures the
      // opening quote, node: is literal, ([^"']+) captures the builtin name,
      // \1 requires the same closing quote.
      const fixed = contents.replace(
        /require\((["'])node:([^"']+)\1\)/g,
        (match, quote, name) => {
          if (!dualFormBuiltins.has(name)) {
            return match
          }
          rewrites += 1
          return `require(${quote}${name}${quote})`
        },
      )
      if (rewrites > 0) {
        await fs.writeFile(filePath, fixed, 'utf8')
        if (!quiet) {
          logger.log(
            `  Rewrote ${rewrites} node:-prefixed require(s) in ${path.relative(path.join(dir, '..', '..'), filePath)}`,
          )
        }
      }
    }
  }
}

async function bundleScopedPackage(
  scope: string,
  name: string,
  options: {
    bundle?: boolean | undefined
    optional?: boolean | undefined
    quiet?: boolean | undefined
  },
): Promise<number | undefined> {
  const opts = { __proto__: null, ...options } as typeof options
  const outputPath = path.join(DIST_EXTERNAL_DIR, scope, `${name}.js`)
  if (opts.bundle === false) {
    await fs.copyFile(
      path.join(SRC_EXTERNAL_DIR, scope, `${name}.js`),
      outputPath,
    )
    return undefined
  }
  try {
    return await bundlePackage(`${scope}/${name}`, outputPath, rootDir, {
      quiet: opts.quiet,
    })
  } catch (error) {
    if (!opts.optional) {
      throw error
    }
    if (!opts.quiet) {
      logger.log(`  Skipping optional package ${scope}/${name}`)
    }
    return undefined
  }
}

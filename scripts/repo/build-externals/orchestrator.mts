/**
 * @file Main entry point for bundling external dependencies. Orchestrates
 *   bundling and reporting.
 */

import { promises as fs } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'
import { bundlePackage } from './bundler.mts'
import { externalPackages, scopedPackages } from './config.mts'
import { copyLocalFiles, ensureDir } from './copy-files.mts'
import { transformPrimordials } from './transform-primordials.mts'

const logger = getDefaultLogger()

const rootDir = REPO_ROOT
const distExternalDir = path.join(rootDir, 'dist', 'external')

/**
 * Main build function.
 *
 * @param {object} options - Build options.
 * @param {boolean} options.verbose - Show detailed output.
 * @param {boolean} options.quiet - Suppress all output.
 *
 * @returns {Promise<void>}
 */
export async function buildExternals(options = {}) {
  const { quiet = false, verbose = false } = options

  // Default behavior: show header but not individual packages (concise)
  // --verbose: show all package details
  // --quiet: show nothing
  const showDetails = verbose && !quiet

  // Ensure dist/external directory exists.
  await ensureDir(distExternalDir)

  // Bundle all packages
  const { bundledCount, totalSize } = await bundleAllPackages({
    quiet: quiet || !showDetails,
  })

  // Post-process: Fix node-gyp strings to prevent bundler issues for consumers
  await fixNodeGypStrings(distExternalDir, { quiet })

  // Post-process: rewrite `require("node:X")` to the bare builtin form so
  // browser bundlers can stub the specifier via the package.json `browser`
  // field (webpack throws UnhandledSchemeError on the `node:` scheme before
  // the stubs apply — same doctrine as src/node/module.ts's bare `module`).
  await rewriteBareBuiltinRequires(distExternalDir, { quiet })

  // Post-process: rewrite well-known global calls (Buffer.from, Date.now,
  // Object.keys, …) to socket-lib's primordials surface so the bundled
  // externals don't depend on a clean caller realm. The codemod has a
  // built-in workaround for the acorn-wasm parser's range-serialization
  // bug (it repairs broken `end` positions by walking children, and
  // scans source for the closing `)` when the call's outer end is
  // unreliable — see tools/prim/src/codemod.mts).
  const distRoot = path.dirname(distExternalDir)
  await transformPrimordials(distRoot, distExternalDir, { quiet })

  // Ship hand-authored .d.ts stubs (e.g. src/external/std-env.d.ts) next to the
  // bundled .js so public re-exports of an external's type surface resolve for
  // consumers — an inlined devDependency has no downstream types otherwise. Runs
  // last so the .js-only transform passes above never parse a .d.ts.
  await copyLocalFiles(
    path.join(rootDir, 'src', 'external'),
    distExternalDir,
    quiet || !showDetails,
  )

  return { bundledCount, totalSize }
}

/**
 * Bundle all external packages.
 *
 * @param {object} options - Options.
 * @param {boolean} options.quiet - Suppress individual package output.
 *
 * @returns {Promise<{ bundledCount: number; totalSize: number }>}
 */
export async function bundleAllPackages(options = {}) {
  const { quiet = false } = options
  let bundledCount = 0
  let totalSize = 0

  // Bundle each external package or copy non-bundled files.
  for (const { bundle, name } of externalPackages) {
    if (bundle) {
      const outputPath = path.join(distExternalDir, `${name}.js`)
      const size = await bundlePackage(name, outputPath, {
        quiet,
        rootDir,
      })
      if (size) {
        bundledCount++
        totalSize += size
      }
    } else {
      // Copy non-bundled file as-is (thin re-export wrapper)
      const srcPath = path.join(rootDir, 'src', 'external', `${name}.js`)
      const destPath = path.join(distExternalDir, `${name}.js`)
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
    const scopeDir = path.join(distExternalDir, scope)
    await ensureDir(scopeDir)

    if (name) {
      // Single package in scope.
      const outputPath = path.join(scopeDir, `${name}.js`)
      if (bundle === false) {
        // Copy non-bundled file as-is (thin re-export wrapper)
        const srcPath = path.join(
          rootDir,
          'src',
          'external',
          scope,
          `${name}.js`,
        )
        await fs.copyFile(srcPath, outputPath)
      } else if (optional) {
        try {
          const size = await bundlePackage(`${scope}/${name}`, outputPath, {
            quiet,
            rootDir,
          })
          if (size) {
            bundledCount++
            totalSize += size
          }
        } catch {
          if (!quiet) {
            logger.log(`  Skipping optional package ${scope}/${name}`)
          }
        }
      } else {
        const size = await bundlePackage(`${scope}/${name}`, outputPath, {
          quiet,
          rootDir,
        })
        if (size) {
          bundledCount++
          totalSize += size
        }
      }
    } else if (packages) {
      // Multiple packages in scope.
      for (const pkg of packages) {
        const outputPath = path.join(scopeDir, `${pkg}.js`)
        if (bundle === false) {
          // Copy non-bundled file as-is (thin re-export wrapper)
          const srcPath = path.join(
            rootDir,
            'src',
            'external',
            scope,
            `${pkg}.js`,
          )
          await fs.copyFile(srcPath, outputPath)
        } else if (optional) {
          try {
            const size = await bundlePackage(`${scope}/${pkg}`, outputPath, {
              quiet,
              rootDir,
            })
            if (size) {
              bundledCount++
              totalSize += size
            }
          } catch {
            if (!quiet) {
              logger.log(`  Skipping optional package ${scope}/${pkg}`)
            }
          }
        } else {
          const size = await bundlePackage(`${scope}/${pkg}`, outputPath, {
            quiet,
            rootDir,
          })
          if (size) {
            bundledCount++
            totalSize += size
          }
        }
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
        const outputPath = path.join(distExternalDir, scope, outFilename)
        const packageName = `${scope}/${subpath}`
        // Ensure parent directory exists
        await ensureDir(path.dirname(outputPath))
        const size = await bundlePackage(packageName, outputPath, {
          quiet,
          rootDir,
        })
        if (size) {
          bundledCount++
          totalSize += size
        }
      }
    }
  }

  return { bundledCount, totalSize }
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
export async function fixNodeGypStrings(dir, options = {}) {
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
export async function rewriteBareBuiltinRequires(dir, options = {}) {
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

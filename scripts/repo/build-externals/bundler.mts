/**
 * @file Package bundling logic using rolldown.
 */

import { existsSync, promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import { rolldown } from 'rolldown'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'

import {
  getPackageSpecificOptions,
  getRolldownConfig,
} from './rolldown-config.mts'
import {
  getLocalPackagePath,
  resolveLocalEntryPoint,
} from './local-packages.mts'

const require = createRequire(import.meta.url)
const logger = getDefaultLogger()

/**
 * Bundle a single package with rolldown.
 *
 * @param {string} packageName - Name of the package to bundle.
 * @param {string} outputPath - Output file path.
 * @param {string} rootDir - Root directory.
 * @param {object} [options] - Bundling options.
 * @param {boolean} [options.quiet] - Suppress output.
 *
 * @returns {Promise<number | undefined>} Size in KB or undefined on error
 */
export async function bundlePackage(
  packageName: string,
  outputPath: string,
  rootDir: string,
  options?: { quiet?: boolean | undefined } | undefined,
) {
  // Read through a null-prototype copy so a polluted Object.prototype cannot
  // supply either option. Bound to a variable first: a destructuring pattern
  // would give the literal a contextual type and reject `__proto__` as an
  // excess property.
  const opts = { __proto__: null, ...options }
  const quiet = opts.quiet ?? false

  if (!quiet) {
    logger.log(`  Bundling ${packageName}...`)
  }

  try {
    // Check if package is installed.
    let packagePath

    // First, check if src/external/{packageName}.js exists - use as entry point.
    // Preserve scope for scoped packages like @socketregistry/yocto-spinner.
    // Subpath entries may already end in `.js` (e.g. `@npmcli/package-json/
    // lib/read-package.js` — the package's own exports map uses that literal
    // path). Strip an existing `.js` before appending so we don't look for
    // `read-package.js.js` and silently skip the thin wrapper.
    const wrapperName = packageName.endsWith('.js')
      ? packageName
      : `${packageName}.js`
    const srcExternalPath = path.join(rootDir, 'src', 'external', wrapperName)
    if (existsSync(srcExternalPath)) {
      packagePath = srcExternalPath
      if (!quiet) {
        logger.log(
          `  Using entry point ${path.relative(rootDir, srcExternalPath)}`,
        )
      }
    } else {
      // No src/external file, so in dev mode check for local
      // workspace/sibling versions.
      const localPath = await getLocalPackagePath(packageName, rootDir)
      if (localPath) {
        if (!quiet) {
          logger.log(
            `  Using local version from ${path.relative(rootDir, localPath)}`,
          )
        }
        packagePath = await resolveLocalEntryPoint(localPath)
      } else {
        // Fall back to installed version.
        try {
          packagePath = require.resolve(packageName)
        } catch {
          // Package must be installed for bundling - no fallbacks.
          throw new Error(
            `Package "${packageName}" is not installed. Please install it with: pnpm add -D ${packageName}`,
          )
        }
      }
    }

    // Get package-specific optimizations.
    const packageOpts = getPackageSpecificOptions(packageName)

    // Get rolldown configuration.
    const { output, ...inputOptions } = getRolldownConfig(
      packagePath,
      outputPath,
      packageOpts,
    )
    // buildConfig's `output` is typed one-or-many; write() takes one. No
    // config here sets an array, so take the first entry rather than widen
    // write()'s input.
    const writeTarget = Array.isArray(output) ? output[0] : output

    // Bundle the package with rolldown.
    const bundle = await rolldown(inputOptions)
    try {
      await bundle.write(writeTarget)
    } finally {
      await bundle.close()
    }

    // Add a header comment to the bundled file.
    const bundleContent = await fs.readFile(outputPath, 'utf8')
    // Strip 'use strict' from bundle content if present; it is re-added at the
    // top below.
    const contentWithoutStrict = bundleContent.replace(/^"use strict";\n/, '')
    const finalContent = `"use strict";
/**
 * Bundled from ${packageName}
 * This is a zero-dependency bundle created by rolldown.
 */
${contentWithoutStrict}`
    // Atomic write: tmp + rename so a concurrent reader (the
    // primordials codemod's read pass, a parallel builder, or a
    // racing test runner on an overloaded CI host) never observes a
    // truncated header-injection in progress. Past CI symptom:
    // `dist/external/normalize-package-data.js` caught mid-write
    // surfaced as `SyntaxError: Unexpected token '{'`.
    const tmpPath = `${outputPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`
    await fs.writeFile(tmpPath, finalContent)
    await fs.rename(tmpPath, outputPath)

    // Need the file size for the success log line below.
    // oxlint-disable-next-line socket/prefer-exists-sync -- need size
    const stats = await fs.stat(outputPath)
    const sizeKB = Math.round(stats.size / 1024)
    if (!quiet) {
      logger.success(`Bundled ${packageName} (${sizeKB}KB)`)
    }
    return sizeKB
  } catch (e) {
    if (!quiet) {
      logger.fail(`Failed to bundle ${packageName}: ${errorMessage(e)}`)
    }
    // Propagate the failure. The orchestrator wraps optional packages in
    // try/catch and logs a "Skipping optional package" message; required
    // packages bubble up so the build exits non-zero instead of silently
    // shipping throw-stubs that only fail later, at consumer runtime.
    throw e
  }
}

/**
 * @file Individual build steps for the `build` runner (scripts/bundle.mts):
 *   source (rolldown per-file), TypeScript declarations (tsgo), the prim CLI
 *   bundle, external dependencies, and the post-build dist-shaping pass. Each
 *   returns an exit code (and source returns its build time) so the runner can
 *   log + sequence them; the runner owns orchestration, these own one step
 *   each.
 */

import { promises as fsPromises } from 'node:fs'
import path from 'node:path'

import { rolldown } from 'rolldown'

import { WIN32 } from '@socketsecurity/lib-stable/constants/platform'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { buildConfig } from '../../.config/rolldown.config.mts'
import { primBuildConfig } from '../../.config/repo/rolldown.prim.config.mts'
import { REPO_ROOT as rootPath } from '../fleet/paths.mts'
import { runSequence } from '../fleet/util/run-command.mts'

const logger = getDefaultLogger()

export interface BuildSourceOptions {
  quiet?: boolean | undefined
  skipClean?: boolean | undefined
  verbose?: boolean | undefined
  analyze?: boolean | undefined
}

export interface BuildSourceResult {
  exitCode: number
  buildTime: number
}

export async function buildSource(
  options: BuildSourceOptions = {},
): Promise<BuildSourceResult> {
  const { quiet = false, skipClean = false } = options

  // Clean dist directory if needed
  if (!skipClean) {
    const exitCode = await runSequence([
      {
        args: ['scripts/bundle/clean.mts', '--dist', '--quiet'],
        command: 'node',
      },
    ])
    if (exitCode !== 0) {
      if (!quiet) {
        logger.error('Clean failed')
      }
      return { exitCode, buildTime: 0 }
    }
  }

  try {
    const startTime = Date.now()
    const { output, ...inputOptions } = buildConfig
    const bundle = await rolldown(inputOptions)
    try {
      await bundle.write(output)
    } finally {
      await bundle.close()
    }
    const buildTime = Date.now() - startTime

    return { exitCode: 0, buildTime }
  } catch (error) {
    if (!quiet) {
      logger.error('Source build failed')
      logger.error(error)
    }
    return { exitCode: 1, buildTime: 0 }
  }
}

/**
 * Build TypeScript declarations. Returns exitCode for external logging.
 */
export interface BuildTypesOptions {
  quiet?: boolean | undefined
  skipClean?: boolean | undefined
  verbose?: boolean | undefined
}

export async function buildTypes(
  options: BuildTypesOptions = {},
): Promise<number> {
  const {
    quiet = false,
    skipClean = false,
    verbose: _verbose = false,
  } = options

  const commands = []

  if (!skipClean) {
    commands.push({
      args: ['scripts/bundle/clean.mts', '--types', '--quiet'],
      command: 'node',
    })
  }

  commands.push({
    // npm writes a `.cmd` shim on Windows; the extension-less file is a POSIX
    // sh script cmd.exe can't run ("'node_modules' is not recognized"), so pick
    // the platform-correct shim. shell: WIN32 lets cmd.exe resolve the .cmd.
    args: ['--project', 'tsconfig.dts.json'],
    command: WIN32 ? 'node_modules\\.bin\\tsgo.cmd' : 'node_modules/.bin/tsgo',
    options: {
      shell: WIN32,
    },
  })

  const exitCode = await runSequence(commands)

  if (exitCode !== 0) {
    if (!quiet) {
      logger.error('Type declarations build failed')
    }
  }

  return exitCode
}

/**
 * Build the prim CLI: a true bundle (not per-file transpile) that inlines
 * lib-stable + diff + the acorn-wasm wrapper into a single `dist/bin/prim.cjs`.
 * The vendored `acorn-bindgen.cjs` + `acorn.wasm` are copied alongside so the
 * bindgen's `${__dirname}/./acorn.wasm` sibling-load resolves after publish.
 */
export async function buildPrim(
  options: { quiet?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false } = options
  try {
    const { output, ...inputOptions } = primBuildConfig
    const bundle = await rolldown(inputOptions)
    try {
      await bundle.write(output)
    } finally {
      await bundle.close()
    }
    // Stage vendored wasm + bindgen next to the bundle. The bindgen
    // uses `${__dirname}/./acorn.wasm`, so they must be siblings of
    // `dist/bin/prim.cjs` at runtime.
    const binDir = path.join(rootPath, 'dist/bin')
    await fsPromises.mkdir(binDir, { recursive: true })
    const vendor = path.join(rootPath, 'vendor/acorn')
    await fsPromises.copyFile(
      path.join(vendor, 'acorn-bindgen.cjs'),
      path.join(binDir, 'acorn-bindgen.cjs'),
    )
    await fsPromises.copyFile(
      path.join(vendor, 'acorn.wasm'),
      path.join(binDir, 'acorn.wasm'),
    )
    // Make the bin executable so direct invocation works without a `node`
    // prefix.
    await fsPromises.chmod(path.join(binDir, 'prim.cjs'), 0o755)
    return 0
  } catch (error) {
    if (!quiet) {
      logger.error('prim bundle build failed')
      logger.error(error)
    }
    return 1
  }
}

/**
 * Build external dependencies. Returns exitCode for external logging.
 */
export async function buildExternals(
  options: { quiet?: boolean | undefined; verbose?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false, verbose = false } = options

  const args = ['scripts/bundle/externals.mts']
  if (quiet) {
    args.push('--quiet')
  }
  if (verbose) {
    args.push('--verbose')
  }

  const exitCode = await runSequence([
    {
      args,
      command: 'node',
    },
  ])

  if (exitCode !== 0) {
    if (!quiet) {
      logger.error('External dependencies build failed')
    }
  }

  return exitCode
}

/**
 * Run the post-build dist-shaping steps (scripts/post-build.mts). Returns
 * exitCode for external logging.
 */
export async function runPostBuild(
  options: { quiet?: boolean | undefined; verbose?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false, verbose = false } = options

  const postBuildArgs = ['scripts/post-build.mts']
  if (quiet) {
    postBuildArgs.push('--quiet')
  }
  if (verbose) {
    postBuildArgs.push('--verbose')
  }

  const exitCode = await runSequence([
    {
      args: postBuildArgs,
      command: 'node',
    },
  ])

  if (exitCode !== 0) {
    if (!quiet) {
      logger.error('Post-build failed')
    }
  }

  return exitCode
}

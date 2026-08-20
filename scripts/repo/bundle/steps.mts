/**
 * @file Individual build steps for the `build` runner (scripts/repo/bundle.mts):
 *   source built per-file by rolldown, TypeScript declarations (tsgo), the
 *   prim CLI bundle, external dependencies, and the post-build dist-shaping
 *   pass. Each returns an exit code, and the source step also returns its
 *   build time, so the runner can log + sequence them; the runner owns
 *   orchestration, these own one step each.
 */

import { promises as fsPromises } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { rolldown } from 'rolldown'

import { WIN32 } from '@socketsecurity/lib-stable/constants/platform'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { buildConfig } from '../../../.config/rolldown.config.mts'
import { primBuildConfig } from '../../../.config/repo/rolldown.prim.config.mts'
import { REPO_ROOT as rootPath } from '../../fleet/paths.mts'
import { runSequence } from '../../fleet/util/run-command.mts'

// `@ultrathink/acorn.rs.wasm` is declared by tools/prim, not the repo root, and
// pnpm does not hoist it into the root node_modules. Resolve it from the
// package that owns the dependency so the prim bundle step finds it.
const primRequire = createRequire(
  path.join(rootPath, 'tools/prim/package.json'),
)

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
        args: ['scripts/repo/bundle/clean.mts', '--dist', '--quiet'],
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
    // buildConfig's `output` is typed one-or-many; write() takes one. No
    // config here sets an array, so take the first entry rather than widen
    // write()'s input.
    const writeTarget = Array.isArray(output) ? output[0] : output
    const bundle = await rolldown(inputOptions)
    try {
      await bundle.write(writeTarget)
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
 * The verbosity a build step passes down to the node script it runs.
 */
export interface BuildStepOptions {
  quiet?: boolean | undefined
  verbose?: boolean | undefined
}

/**
 * The verbosity flags to forward to a child build script. Only the flags the
 * child actually accepts, so a step whose child takes neither passes none.
 */
export function verbosityFlags(options: BuildStepOptions): string[] {
  const { quiet = false, verbose = false } = {
    __proto__: null,
    ...options,
  } as typeof options
  const flags: string[] = []
  if (quiet) {
    flags.push('--quiet')
  }
  if (verbose) {
    flags.push('--verbose')
  }
  return flags
}

/**
 * Run one node build script, forwarding the verbosity flags, and report a
 * labeled failure unless quiet. `label` reads as the subject of "<label>
 * failed".
 */
export async function runNodeBuildScript(
  scriptPath: string,
  label: string,
  options: BuildStepOptions = {},
): Promise<number> {
  const exitCode = await runSequence([
    {
      args: [scriptPath, ...verbosityFlags(options)],
      command: 'node',
    },
  ])
  if (exitCode !== 0 && options.quiet !== true) {
    logger.error(`${label} failed`)
  }
  return exitCode
}

/**
 * Build TypeScript declarations. Returns exitCode for external logging.
 *
 * No `verbose`: this step runs clean.mts and tsgo, and neither accepts a
 * verbosity flag, so there is nothing to forward one to.
 */
export interface BuildTypesOptions {
  quiet?: boolean | undefined
  skipClean?: boolean | undefined
}

export async function buildTypes(
  options: BuildTypesOptions = {},
): Promise<number> {
  const { quiet = false, skipClean = false } = options

  const commands = []

  if (!skipClean) {
    commands.push({
      args: ['scripts/repo/bundle/clean.mts', '--types', '--quiet'],
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
 * Build the prim CLI: a true bundle rather than a per-file transpile, which
 * inlines lib-stable + diff into a single `dist/bin/prim.cjs`. The
 * `@ultrathink/acorn.rs.wasm` parser's `acorn-wasm.cjs` entry + `acorn.wasm`
 * are copied alongside so its `${__dirname}/./acorn.wasm` sibling-load resolves
 * after publish.
 */
export async function buildPrim(
  options: { quiet?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false } = options
  try {
    const { output, ...inputOptions } = primBuildConfig
    // buildConfig's `output` is typed one-or-many; write() takes one. No
    // config here sets an array, so take the first entry rather than widen
    // write()'s input.
    const writeTarget = Array.isArray(output) ? output[0] : output
    const bundle = await rolldown(inputOptions)
    try {
      await bundle.write(writeTarget)
    } finally {
      await bundle.close()
    }
    // Stage the `@ultrathink/acorn.rs.wasm` parser next to the bundle. Its CJS
    // entry loads `${__dirname}/./acorn.wasm`, so entry + wasm must sit beside
    // `dist/bin/prim.cjs` at runtime (prim.cjs requires `./acorn-wasm.cjs`).
    const binDir = path.join(rootPath, 'dist/bin')
    await fsPromises.mkdir(binDir, { recursive: true })
    const acornEntry = primRequire.resolve('@ultrathink/acorn.rs.wasm')
    const acornDir = path.dirname(acornEntry)
    await fsPromises.copyFile(acornEntry, path.join(binDir, 'acorn-wasm.cjs'))
    await fsPromises.copyFile(
      path.join(acornDir, 'acorn.wasm'),
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
  options: BuildStepOptions = {},
): Promise<number> {
  return await runNodeBuildScript(
    'scripts/repo/bundle/externals.mts',
    'External dependencies build',
    options,
  )
}

/**
 * Run the post-build dist-shaping steps (scripts/repo/post-build.mts). Returns
 * exitCode for external logging.
 */
export async function runPostBuild(
  options: BuildStepOptions = {},
): Promise<number> {
  return await runNodeBuildScript(
    'scripts/repo/post-build.mts',
    'Post-build',
    options,
  )
}

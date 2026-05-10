/**
 * @fileoverview Cross-tool script runner — picks the right package
 * manager by detecting the nearest lockfile and dispatches to its exec
 * function. Falls back to running `node --run` directly when no
 * lockfile is found.
 *
 * Lockfile precedence (first match wins, walking up from cwd):
 *   1. pnpm-lock.yaml → execPnpm(['run', scriptName, ...args])
 *   2. package-lock.json → execNpm(['run', scriptName, ...args])
 *   3. yarn.lock → execYarn(['run', scriptName, ...args])
 *   4. (no lockfile) → node --run scriptName (or `node <npm-cli> run`
 *      on older Node where `node --run` isn't available)
 *
 * Honors `shell: true` by passing through to spawn() unchanged.
 */

import process from 'node:process'

import {
  NPM_REAL_EXEC_PATH,
  PACKAGE_LOCK_JSON,
  PNPM_LOCK_YAML,
  YARN_LOCK,
} from '../../constants/agents'
import {
  getExecPath,
  getNodeNoWarningsFlags,
  supportsNodeRun,
} from '../../constants/node'
import { findUpSync } from '../../fs/find-up'
import { getOwn } from '../../objects'
import { ArrayIsArray } from '../../primordials'
import { spawn } from '../../spawn/core'

import { execNpm } from './npm/exec'
import { execPnpm } from './pnpm/exec'
import { execYarn } from './yarnpkg/yarn/exec'

import type { SpawnOptions } from '../../spawn/types'

export interface ExecScriptOptions extends SpawnOptions {
  prepost?: boolean | undefined
}

/**
 * Execute a package.json script using the detected package manager.
 *
 * @param scriptName - The package.json script to run
 * @param args - Either the script arguments or an options object
 * @param options - Spawn options plus `prepost` to force npm-style pre/post scripts
 * @returns The spawned `ChildProcess`-like promise from the underlying runner.
 */
export function execScript(
  scriptName: string,
  args?: string[] | readonly string[] | ExecScriptOptions | undefined,
  options?: ExecScriptOptions | undefined,
) {
  // Overloaded signatures: execScript(name, options) or execScript(name, args, options).
  let resolvedOptions: ExecScriptOptions | undefined
  let resolvedArgs: string[]
  if (!ArrayIsArray(args) && args !== null && typeof args === 'object') {
    resolvedOptions = args as ExecScriptOptions
    resolvedArgs = []
  } else {
    resolvedOptions = options
    resolvedArgs = (args || []) as string[]
  }
  const { prepost, ...spawnOptions } = {
    __proto__: null,
    ...resolvedOptions,
  } as ExecScriptOptions

  // shell: true bypasses agent detection — caller wants direct execution.
  if (spawnOptions.shell === true) {
    return spawn(scriptName, resolvedArgs, spawnOptions)
  }

  const useNodeRun = !prepost && supportsNodeRun()

  const cwd =
    (getOwn(spawnOptions, 'cwd') as string | undefined) ?? process.cwd()

  const pnpmLockPath = findUpSync(PNPM_LOCK_YAML, { cwd }) as string | undefined
  if (pnpmLockPath) {
    return execPnpm(['run', scriptName, ...resolvedArgs], spawnOptions)
  }

  // package-lock.json and yarn.lock fallback paths fire only in
  // npm/yarn workspaces; the fleet uses pnpm, so the pnpm-lock branch
  // hits and these are unreachable in fleet test runs.
  /* c8 ignore start */
  const packageLockPath = findUpSync(PACKAGE_LOCK_JSON, { cwd }) as
    | string
    | undefined
  if (packageLockPath) {
    return execNpm(['run', scriptName, ...resolvedArgs], spawnOptions)
  }

  const yarnLockPath = findUpSync(YARN_LOCK, { cwd }) as string | undefined
  if (yarnLockPath) {
    return execYarn(['run', scriptName, ...resolvedArgs], spawnOptions)
  }
  /* c8 ignore stop */

  // No-lockfile fallback. findUpSync walks ancestor directories, so
  // reaching this in unit tests requires a tmpdir whose ancestors have
  // no pnpm-lock/package-lock/yarn.lock.
  /* c8 ignore start */
  return spawn(
    getExecPath(),
    [
      ...getNodeNoWarningsFlags(),
      ...(useNodeRun ? ['--run'] : [NPM_REAL_EXEC_PATH, 'run']),
      scriptName,
      ...resolvedArgs,
    ],
    {
      ...spawnOptions,
    },
  )
  /* c8 ignore stop */
}

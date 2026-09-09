import { whichSync } from '../exe/path/which.mjs'
import { getNodeChildProcess } from '../node/child-process.mjs'
import { getNodeProcess } from '../node/process.mjs'

import type { ChildProcess, SpawnOptions } from 'node:child_process'

export type OnePasswordAuthorizationStatus =
  | 'authorized'
  | 'not-interactive'
  | 'cli-unavailable'
  | 'authorization-failed'
  | 'timed-out'

export interface OnePasswordAuthorizationResult {
  status: OnePasswordAuthorizationStatus
  exitCode?: number | undefined
}

export interface OnePasswordAuthorizationOptions {
  account: string
  timeoutMs?: number | undefined
  runtime?:
    | {
        env: Record<string, string | undefined>
        isTTY: boolean
        which: typeof whichSync
        spawn: (
          executable: string,
          args: string[],
          options: SpawnOptions,
        ) => ChildProcess
      }
    | undefined
}

export function authorizeOnePasswordTerminal(
  options: OnePasswordAuthorizationOptions,
): Promise<OnePasswordAuthorizationResult> {
  const { account, timeoutMs = 120_000 } = {
    __proto__: null,
    ...options,
  } as typeof options
  validateOnePasswordAuthorization(account, timeoutMs)
  const runtime = options.runtime ?? getOnePasswordRuntime()
  if (!runtime.isTTY || !runtime.spawn) {
    return Promise.resolve({ status: 'not-interactive' })
  }
  let executable: ReturnType<typeof whichSync>
  try {
    executable = runtime.which('op', {
      path: runtime.env['PATH'],
      nothrow: true,
    })
  } catch {
    return Promise.resolve({ status: 'authorization-failed' })
  }
  if (typeof executable !== 'string' || !executable) {
    return Promise.resolve({ status: 'cli-unavailable' })
  }
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(runtime.env)) {
    if (!name.toUpperCase().startsWith('OP_')) {
      env[name] = value
    }
  }
  env['OP_ACCOUNT'] = account
  env['OP_BIOMETRIC_UNLOCK_ENABLED'] = 'true'
  return new Promise(resolve => {
    let child: ChildProcess
    try {
      child = runtime.spawn(executable, ['signin', '--account', account], {
        env,
        shell: false,
        stdio: ['inherit', 'ignore', 'ignore'],
      })
    } catch (error) {
      resolve({ status: onePasswordLaunchStatus(error) })
      return
    }
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        return
      } finally {
        resolve({ status: 'timed-out' })
      }
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      resolve({
        status: timedOut ? 'timed-out' : onePasswordLaunchStatus(error),
      })
    })
    child.once('close', code => {
      clearTimeout(timer)
      if (timedOut) {
        resolve({ status: 'timed-out' })
      } else if (code === 0) {
        resolve({ status: 'authorized' })
      } else {
        resolve({
          status: 'authorization-failed',
          ...(typeof code === 'number' ? { exitCode: code } : {}),
        })
      }
    })
  })
}

export function getOnePasswordRuntime(): NonNullable<
  OnePasswordAuthorizationOptions['runtime']
> {
  const process = getNodeProcess()
  const childProcess = getNodeChildProcess()
  return {
    env: process?.env ?? {},
    isTTY: process?.stdin?.isTTY === true && process?.stderr?.isTTY === true,
    spawn: childProcess?.spawn,
    which: whichSync,
  }
}

export function onePasswordLaunchStatus(
  error: unknown,
): OnePasswordAuthorizationStatus {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
    ? 'cli-unavailable'
    : 'authorization-failed'
}

export function validateOnePasswordAuthorization(
  account: string,
  timeoutMs: number,
): void {
  if (
    typeof account !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(account)
  ) {
    throw new TypeError('Expected a 1Password account address or ID')
  }
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new RangeError(
      'Expected a positive 1Password timeout within the Node timer range',
    )
  }
}

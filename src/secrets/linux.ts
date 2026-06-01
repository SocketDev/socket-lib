/**
 * @file Linux Secret Service backend via `secret-tool`. `secret-tool` is the
 *   user-facing CLI for libsecret, which talks to any running Secret Service
 *   provider (gnome-keyring, kwallet5, KeePassXC's Secret Service integration,
 *   etc.). Most desktop Linux installs have one; headless / containerized hosts
 *   do not. Storage shape: each item has a `service=<svc> user=<account>`
 *   attribute pair plus the password body. Reads + writes use those two
 *   attributes as the lookup key. The label (`--label`) is what shows up in the
 *   user's keyring UI; we set it to the same string passed in by the caller. No
 *   backing-file fallback. If `secret-tool` isn't on PATH or no Secret Service
 *   provider is running, reads return `undefined` and writes throw with an
 *   actionable hint — callers fall back to env variables for that session.
 */

import {
  spawn,
  spawnSync,
} from '@socketsecurity/lib-stable/process/spawn/child'

import { ErrorCtor } from '../primordials/error'

import { PromiseCtor } from '../primordials/promise'

const SECRET_TOOL_BIN = 'secret-tool'

export async function deleteLinux(
  service: string,
  account: string,
): Promise<'removed' | 'absent'> {
  return new PromiseCtor(resolve => {
    const child = spawn(
      SECRET_TOOL_BIN,
      ['clear', 'service', service, 'user', account],
      { stdio: 'ignore' },
    )
    child.on('error', () => resolve('absent'))
    child.on('close', status => resolve(status === 0 ? 'removed' : 'absent'))
  })
}

export function deleteLinuxSync(
  service: string,
  account: string,
): 'removed' | 'absent' {
  const r = spawnSync(
    SECRET_TOOL_BIN,
    ['clear', 'service', service, 'user', account],
    { stdio: 'ignore' },
  )
  return r.status === 0 ? 'removed' : 'absent'
}

export function isLinuxBackendAvailable(): boolean {
  const r = spawnSync(SECRET_TOOL_BIN, ['--version'], { stdio: 'ignore' })
  return r.status === 0
}

export async function readLinux(
  service: string,
  account: string,
): Promise<string | undefined> {
  return new PromiseCtor(resolve => {
    const child = spawn(
      SECRET_TOOL_BIN,
      ['lookup', 'service', service, 'user', account],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.on('error', () => resolve(undefined))
    child.on('close', status => {
      if (status !== 0) {
        resolve(undefined)
        return
      }
      const out = stdout.trim()
      resolve(out || undefined)
    })
  })
}

export function readLinuxSync(
  service: string,
  account: string,
): string | undefined {
  const r = spawnSync(
    SECRET_TOOL_BIN,
    ['lookup', 'service', service, 'user', account],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  if (r.status !== 0) {
    return undefined
  }
  const out = r.stdout.trim()
  return out || undefined
}

export async function writeLinux(
  service: string,
  account: string,
  value: string,
  label: string,
): Promise<void> {
  return new PromiseCtor((resolve, reject) => {
    const child = spawn(
      SECRET_TOOL_BIN,
      ['store', `--label=${label}`, 'service', service, 'user', account],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', err =>
      reject(
        new Error(
          `secret-tool store failed: ${err.message}. ` +
            'Install libsecret-tools (apt install libsecret-tools / dnf install libsecret) ' +
            'or ensure a Secret Service provider (gnome-keyring, kwallet) is running.',
        ),
      ),
    )
    child.on('close', status => {
      if (status === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `secret-tool store failed (status=${status}, user=${account}): ${stderr.trim()}. ` +
            'Install libsecret-tools (apt install libsecret-tools / dnf install libsecret) ' +
            'or ensure a Secret Service provider (gnome-keyring, kwallet) is running.',
        ),
      )
    })
    // `secret-tool store` reads the password from stdin so the value
    // never appears in `ps(1)` / `/proc/<pid>/cmdline`.
    child.stdin.end(value)
  })
}

export function writeLinuxSync(
  service: string,
  account: string,
  value: string,
  label: string,
): void {
  const r = spawnSync(
    SECRET_TOOL_BIN,
    ['store', `--label=${label}`, 'service', service, 'user', account],
    {
      encoding: 'utf8',
      input: value,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  if (r.status !== 0) {
    throw new ErrorCtor(
      `secret-tool store failed (status=${r.status}, user=${account}): ${r.stderr.trim()}. ` +
        'Install libsecret-tools (apt install libsecret-tools / dnf install libsecret) ' +
        'or ensure a Secret Service provider (gnome-keyring, kwallet) is running.',
    )
  }
}

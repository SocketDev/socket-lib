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
    const { process: cp } = spawn(
      SECRET_TOOL_BIN,
      ['clear', 'service', service, 'user', account],
      { stdio: 'ignore' },
    )
    cp.on('error', () => resolve('absent'))
    cp.on('close', status => resolve(status === 0 ? 'removed' : 'absent'))
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
  // Let the lib spawn own output buffering (stdioString → string stdout). Don't
  // attach `.setEncoding('utf8')` + `.on('data')` — that flips the stream to
  // string chunks while the lib buffers it as Buffers + does Buffer.concat on
  // close, throwing `TypeError: list[0] must be a Buffer`. The lib rejects on a
  // non-zero exit (a missing entry), which is just "undefined" here.
  try {
    const r = await spawn(
      SECRET_TOOL_BIN,
      ['lookup', 'service', service, 'user', account],
      { stdio: ['ignore', 'pipe', 'pipe'], stdioString: true },
    )
    const out = String(r.stdout ?? '').trim()
    return out || undefined
  } catch {
    return undefined
  }
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
  const hint =
    'Install libsecret-tools (apt install libsecret-tools / dnf install libsecret) ' +
    'or ensure a Secret Service provider (gnome-keyring, kwallet) is running.'
  // Let the lib spawn own output buffering (stdioString); write the value to
  // stdin via the returned `process` so it stays out of the process listing
  // (`ps`) and the kernel argv view. Don't attach `.setEncoding`/`.on('data')`
  // — that races the lib's Buffer.concat-on-close (see readLinux). The lib
  // rejects on a non-zero exit with `{ code, stderr }`; re-throw it as the
  // helpful error.
  const child = spawn(
    SECRET_TOOL_BIN,
    ['store', `--label=${label}`, 'service', service, 'user', account],
    { stdio: ['pipe', 'pipe', 'pipe'], stdioString: true },
  )
  child.process.stdin!.end(value)
  try {
    await child
  } catch (e) {
    const err = e as
      | {
          code?: number | undefined
          stderr?: unknown | undefined
          message?: string | undefined
        }
      | undefined
    const status = typeof err?.code === 'number' ? err.code : -1
    const stderr = String(err?.stderr ?? err?.message ?? '').trim()
    throw new ErrorCtor(
      `secret-tool store failed (status=${status}, user=${account}): ${stderr}. ${hint}`,
    )
  }
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

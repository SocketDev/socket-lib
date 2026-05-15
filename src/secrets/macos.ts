/**
 * @fileoverview macOS Keychain backend via `security(1)`.
 *
 * The native `security` CLI ships with macOS — no install step. We
 * use generic-password items, which are the simplest credential
 * shape Keychain supports (service + account → password string).
 *
 * Process model: each call spawns `security`. Read returns the
 * password on stdout; write uses `-w <value>` (we accept that the
 * value briefly appears in argv — `security` is local-only and runs
 * in the user's session, so the leakage surface is `ps(1)` for one
 * other process on the same user). Delete is best-effort.
 *
 * ACL: `-T '' -A` does NOT make the entry callable from any process
 * without prompting. We deliberately omit `-T` so the entry uses the
 * default ACL — what the operator expects from a `security add`
 * directly. If a downstream tool wants its own ACL, it can `security
 * set-generic-password-partition-list` after the write.
 */

import { spawn, spawnSync } from 'node:child_process'

const SECURITY_BIN = 'security'

interface SpawnOpts {
  stdio?: 'ignore' | 'pipe' | ['ignore', 'pipe', 'pipe']
}

function runAsync(args: readonly string[], opts: SpawnOpts = {}): Promise<{
  status: number | null
  stdout: string
  stderr: string
}> {
  return new Promise(resolve => {
    const child = spawn(SECURITY_BIN, args as string[], {
      stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    if (child.stdout) {
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        stdout += chunk
      })
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => {
        stderr += chunk
      })
    }
    child.on('error', () => resolve({ status: -1, stdout, stderr }))
    child.on('close', status => resolve({ status, stdout, stderr }))
  })
}

export async function deleteMacOS(
  service: string,
  account: string,
): Promise<'removed' | 'absent'> {
  // Exit 0 = removed; exit 44 = SecKeychainSearchCopyNext: item not
  // found (treat as already-absent — caller's desired state). Any
  // other non-zero is an unusual failure; we don't surface it because
  // the public API contract is "idempotent best-effort delete."
  const r = await runAsync(
    ['delete-generic-password', '-s', service, '-a', account],
    { stdio: 'ignore' },
  )
  return r.status === 0 ? 'removed' : 'absent'
}

export function deleteMacOSSync(
  service: string,
  account: string,
): 'removed' | 'absent' {
  const r = spawnSync(
    SECURITY_BIN,
    ['delete-generic-password', '-s', service, '-a', account],
    { stdio: 'ignore' },
  )
  return r.status === 0 ? 'removed' : 'absent'
}

export function isMacOSBackendAvailable(): boolean {
  // `security(1)` is a base-system binary. We could shell out to
  // confirm, but on any reachable macOS host it's always there.
  return true
}

export async function readMacOS(
  service: string,
  account: string,
): Promise<string | undefined> {
  const r = await runAsync([
    'find-generic-password',
    '-s',
    service,
    '-a',
    account,
    '-w',
  ])
  if (r.status !== 0) {
    return undefined
  }
  const out = r.stdout.trim()
  return out || undefined
}

export function readMacOSSync(
  service: string,
  account: string,
): string | undefined {
  const r = spawnSync(
    SECURITY_BIN,
    ['find-generic-password', '-s', service, '-a', account, '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  if (r.status !== 0) {
    return undefined
  }
  const out = r.stdout.trim()
  return out || undefined
}

export async function writeMacOS(
  service: string,
  account: string,
  value: string,
  label: string,
): Promise<void> {
  // `-U` updates if the entry already exists; without -U a second
  // `add-generic-password` errors. `-D` sets the kind (shown in
  // Keychain Access.app), `-l` is the display label.
  const r = await runAsync([
    'add-generic-password',
    '-U',
    '-s',
    service,
    '-a',
    account,
    '-w',
    value,
    '-D',
    label,
    '-l',
    label,
  ])
  if (r.status !== 0) {
    throw new Error(
      `security(1) add-generic-password failed (status=${r.status}, account=${account}): ${r.stderr.trim()}`,
    )
  }
}

export function writeMacOSSync(
  service: string,
  account: string,
  value: string,
  label: string,
): void {
  const r = spawnSync(
    SECURITY_BIN,
    [
      'add-generic-password',
      '-U',
      '-s',
      service,
      '-a',
      account,
      '-w',
      value,
      '-D',
      label,
      '-l',
      label,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  if (r.status !== 0) {
    throw new Error(
      `security(1) add-generic-password failed (status=${r.status}, account=${account}): ${r.stderr.trim()}`,
    )
  }
}

/**
 * @file MacOS Keychain backend via `security(1)`. The native `security` CLI
 *   ships with macOS — no install step. We use generic-password items, which
 *   are the simplest credential shape Keychain supports (service + account →
 *   password string). Process model: each call spawns `security`. Read returns
 *   the password on stdout; write uses `-w <value>` (we accept that the value
 *   briefly appears in argv — `security` is local-only and runs in the user's
 *   session, so the leakage surface is `ps(1)` for one other process on the
 *   same user). Delete is best-effort. ACL: writes use `-A -T ''` so any
 *   application on the user's account can read the entry without an extra
 *   Keychain prompt. The first write still prompts once (creating / updating
 *   the entry requires the user to authorize that one action), but every later
 *   read is silent — sfw, socket-cli, MCP servers, and the bash shell itself
 *   all read the same value with no UI. The trust model: the user explicitly
 *   authorized the install flow that wrote this; the value is theirs to use
 *   across their tooling, not a credential earmarked for a single binary path.
 *   Revocable in Keychain Access.app if the user changes their mind. This
 *   restores the original wheelhouse `token-storage.mts` behavior dropped in
 *   v6's first cut.
 */

import { spawn, spawnSync } from 'node:child_process'

const SECURITY_BIN = 'security'

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

interface SpawnOpts {
  stdio?: 'ignore' | 'pipe' | ['ignore', 'pipe', 'pipe']
}

export function runAsync(
  args: readonly string[],
  opts: SpawnOpts = {},
): Promise<{
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

export async function writeMacOS(
  service: string,
  account: string,
  value: string,
  label: string,
): Promise<void> {
  // Flags:
  //   `-U`     update if exists; without it a second add errors.
  //   `-D`     kind/description shown in Keychain Access.app.
  //   `-l`     display label in Keychain Access.app.
  //   `-T ''`  no specific app in the ACL — combined with `-A` this
  //            grants "any app may read without prompting" so future
  //            reads from any process don't surface a Keychain auth
  //            prompt. Without this flag, the first read by every
  //            new binary path triggers a prompt. (Incident memory:
  //            socket-cli session 2026-05-15 — keychain prompts on
  //            every Bash tool invocation.)
  //   `-A`     allow access by any application without warning,
  //            paired with `-T ''`.
  const r = await runAsync([
    'add-generic-password',
    '-U',
    '-A',
    '-T',
    '',
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
  // Mirrors writeMacOS — see that function for the ACL flag rationale.
  const r = spawnSync(
    SECURITY_BIN,
    [
      'add-generic-password',
      '-U',
      '-A',
      '-T',
      '',
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

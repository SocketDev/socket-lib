/**
 * @file Windows backend via PowerShell CredentialManager module, with a
 *   DPAPI-encrypted file fallback. Two paths, tried in order:
 *
 *   1. CredentialManager PowerShell module (`New-StoredCredential` /
 *      `Get-StoredCredential` / `Remove-StoredCredential`). The cleanest path —
 *      stored credentials live in the Windows Credential Manager, the same
 *      place `cmdkey` writes to. Requires the module to be installed
 *      (`Install-Module CredentialManager -Scope CurrentUser`).
 *   2. DPAPI-encrypted file under `%APPDATA%\<service>\<account>.enc`. Used when
 *      the CredentialManager module isn't available.
 *      `System.Security.Cryptography.ProtectedData` encrypts under the
 *      current-user machine key — readable only by this user on this machine,
 *      never plaintext. The target name composed for CredentialManager is
 *      `service:account` (matching `cmdkey /generic:<target>` convention).
 */

import {
  spawn,
  spawnSync,
} from '@socketsecurity/lib-stable/process/spawn/child'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import type fs from 'node:fs'

import { ErrorCtor } from '../primordials/error'

import { JSONStringify } from '../primordials/json'

const POWERSHELL_BIN = 'powershell'

export function buildTarget(service: string, account: string): string {
  return `${service}:${account}`
}

export async function deleteWindows(
  service: string,
  account: string,
): Promise<'removed' | 'absent'> {
  const target = buildTarget(service, account)
  let removedAny = false
  // CredentialManager removal first.
  const psScript = `
    try { Remove-StoredCredential -Target ${quotePs(target)}; exit 0 }
    catch { exit 1 }
  `
  const ps = await runPsAsync(psScript)
  if (ps.status === 0) {
    removedAny = true
  }
  // DPAPI file cleanup as well — both backends are independent.
  const filePath = getDpapiFilePath(service, account)
  if (existsSync(filePath)) {
    try {
      const { rmSync } = await import('node:fs')
      rmSync(filePath, { force: true })
      removedAny = true
    } catch {
      // best-effort
    }
  }
  return removedAny ? 'removed' : 'absent'
}

export function deleteWindowsSync(
  service: string,
  account: string,
): 'removed' | 'absent' {
  const target = buildTarget(service, account)
  let removedAny = false
  const psScript = `
    try { Remove-StoredCredential -Target ${quotePs(target)}; exit 0 }
    catch { exit 1 }
  `
  const ps = runPsSync(psScript)
  if (ps.status === 0) {
    removedAny = true
  }
  const filePath = getDpapiFilePath(service, account)
  if (existsSync(filePath)) {
    try {
      const fsMod = require('node:fs') as typeof fs
      fsMod.rmSync(filePath, { force: true })
      removedAny = true
    } catch {
      // best-effort
    }
  }
  return removedAny ? 'removed' : 'absent'
}

export function getDpapiFilePath(service: string, account: string): string {
  validateKeychainComponent(service, 'service')
  validateKeychainComponent(account, 'account')
  const appData =
    process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(appData, service, `${account}.enc`)
}

export function isWindowsBackendAvailable(): boolean {
  // PowerShell ships with Windows 10+; we treat the CredentialManager
  // module + DPAPI fallback as a unified backend. If PowerShell is
  // missing the host isn't a usable Windows for this library.
  const r = spawnSync(POWERSHELL_BIN, ['-NoProfile', '-Command', 'exit 0'], {
    stdio: 'ignore',
  })
  return r.status === 0
}

export function quotePs(value: string): string {
  // PowerShell single-quoted strings: escape embedded ' by doubling.
  return `'${value.replace(/'/g, "''")}'`
}

export async function readDpapi(filePath: string): Promise<string | undefined> {
  if (!existsSync(filePath)) {
    return undefined
  }
  const script = `
    Add-Type -AssemblyName System.Security
    $bytes = [Convert]::FromBase64String((Get-Content -Raw ${quotePs(filePath)}))
    $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
    [System.Text.Encoding]::UTF8.GetString($plain)
  `
  const r = await runPsAsync(script)
  if (r.status !== 0) {
    return undefined
  }
  const out = r.stdout.trim()
  return out || undefined
}

export function readDpapiSync(filePath: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined
  }
  const script = `
    Add-Type -AssemblyName System.Security
    $bytes = [Convert]::FromBase64String((Get-Content -Raw ${quotePs(filePath)}))
    $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
    [System.Text.Encoding]::UTF8.GetString($plain)
  `
  const r = runPsSync(script)
  if (r.status !== 0) {
    return undefined
  }
  const out = r.stdout.trim()
  return out || undefined
}

export async function readWindows(
  service: string,
  account: string,
): Promise<string | undefined> {
  const target = buildTarget(service, account)
  const script = `
    try {
      (Get-StoredCredential -Target ${quotePs(target)}).Password |
        ConvertFrom-SecureString -AsPlainText
    } catch { exit 1 }
  `
  const ps = await runPsAsync(script)
  if (ps.status === 0) {
    const out = ps.stdout.trim()
    if (out) {
      return out
    }
  }
  return readDpapi(getDpapiFilePath(service, account))
}

export function readWindowsSync(
  service: string,
  account: string,
): string | undefined {
  const target = buildTarget(service, account)
  const script = `
    try {
      (Get-StoredCredential -Target ${quotePs(target)}).Password |
        ConvertFrom-SecureString -AsPlainText
    } catch { exit 1 }
  `
  const ps = runPsSync(script)
  if (ps.status === 0) {
    const out = ps.stdout.trim()
    if (out) {
      return out
    }
  }
  return readDpapiSync(getDpapiFilePath(service, account))
}

export async function runPsAsync(
  script: string,
  input?: string | undefined,
): Promise<{
  status: number | null
  stdout: string
  stderr: string
}> {
  // Let the lib spawn own output buffering (stdioString → string stdout/
  // stderr). Don't attach `.setEncoding('utf8')` + `.on('data')`: that flips
  // the streams to string chunks while the lib buffers them as Buffers + does
  // Buffer.concat on close, throwing `TypeError: list[0] must be a Buffer`.
  // The lib rejects on a non-zero exit; capture its `{ code, stdout, stderr }`.
  const child = spawn(POWERSHELL_BIN, ['-NoProfile', '-Command', script], {
    stdio: ['pipe', 'pipe', 'pipe'],
    stdioString: true,
  })
  child.process.stdin!.end(input ?? '')
  try {
    const r = await child
    return {
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- the return contract is `status: number | null` (matches Node's ChildProcess exit-code shape); callers branch on `=== 0`.
      status: typeof r.code === 'number' ? r.code : null,
      stderr: String(r.stderr ?? ''),
      stdout: String(r.stdout ?? ''),
    }
  } catch (e) {
    const err = e as
      | {
          code?: number | undefined
          stdout?: unknown | undefined
          stderr?: unknown | undefined
        }
      | undefined
    return {
      status: typeof err?.code === 'number' ? err.code : -1,
      stderr: String(err?.stderr ?? ''),
      stdout: String(err?.stdout ?? ''),
    }
  }
}

export function runPsSync(
  script: string,
  input?: string | undefined,
): {
  status: number | null
  stdout: string
  stderr: string
} {
  const r = spawnSync(POWERSHELL_BIN, ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

/**
 * Reject identifier components (service / account names) that contain path
 * separators, `..` segments, or NUL bytes. These would escape the intended
 * `%APPDATA%\<service>\<account>.enc` layout and let a caller read or overwrite
 * arbitrary files under the user's profile.
 *
 * Throws on bad input rather than sanitizing — callers should pass logical
 * identifiers (e.g. `socket-cli`, `SOCKET_API_KEY`), not paths.
 */
export function validateKeychainComponent(value: string, name: string): void {
  if (
    // oxlint-disable-next-line socket/prefer-normalize-path -- screens an IDENTIFIER for separator characters (security reject); not a path match.
    /[\\/]/.test(value) ||
    value.includes('..') ||
    value.includes('\0') ||
    value === '' ||
    value === '.'
  ) {
    throw new ErrorCtor(
      `secrets/windows: ${name} contains path-traversal characters: ${JSONStringify(value)}. Use a plain identifier (no \\\\, /, .., or NUL).`,
    )
  }
}

export async function writeDpapi(
  filePath: string,
  value: string,
): Promise<void> {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const script = `
    Add-Type -AssemblyName System.Security
    $token = [Console]::In.ReadToEnd().Trim()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($token)
    $protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
    [Convert]::ToBase64String($protected) | Set-Content -Path ${quotePs(filePath)} -NoNewline
  `
  const r = await runPsAsync(script, value)
  if (r.status !== 0) {
    throw new ErrorCtor(
      `DPAPI file write failed: ${r.stderr.trim()}. ` +
        'Install the CredentialManager PowerShell module (' +
        '`Install-Module CredentialManager -Scope CurrentUser`) for a cleaner storage path.',
    )
  }
}

export function writeDpapiSync(filePath: string, value: string): void {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const script = `
    Add-Type -AssemblyName System.Security
    $token = [Console]::In.ReadToEnd().Trim()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($token)
    $protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
    [Convert]::ToBase64String($protected) | Set-Content -Path ${quotePs(filePath)} -NoNewline
  `
  const r = runPsSync(script, value)
  if (r.status !== 0) {
    throw new ErrorCtor(
      `DPAPI file write failed: ${r.stderr.trim()}. ` +
        'Install the CredentialManager PowerShell module (' +
        '`Install-Module CredentialManager -Scope CurrentUser`) for a cleaner storage path.',
    )
  }
}

export async function writeWindows(
  service: string,
  account: string,
  value: string,
  _label: string,
): Promise<void> {
  const target = buildTarget(service, account)
  // CredentialManager path first (cleanest). The token is piped on
  // stdin so it doesn't appear in `Get-Process` argv.
  const psScript = `
    $token = $input | Out-String
    $token = $token.Trim()
    $secure = ConvertTo-SecureString $token -AsPlainText -Force
    try {
      New-StoredCredential -Target ${quotePs(target)} -UserName ${quotePs(account)} -SecurePassword $secure -Persist LocalMachine | Out-Null
      exit 0
    } catch { exit 1 }
  `
  const ps = await runPsAsync(psScript, value)
  if (ps.status === 0) {
    return
  }
  await writeDpapi(getDpapiFilePath(service, account), value)
}

export function writeWindowsSync(
  service: string,
  account: string,
  value: string,
  _label: string,
): void {
  const target = buildTarget(service, account)
  const psScript = `
    $token = $input | Out-String
    $token = $token.Trim()
    $secure = ConvertTo-SecureString $token -AsPlainText -Force
    try {
      New-StoredCredential -Target ${quotePs(target)} -UserName ${quotePs(account)} -SecurePassword $secure -Persist LocalMachine | Out-Null
      exit 0
    } catch { exit 1 }
  `
  const ps = runPsSync(psScript, value)
  if (ps.status === 0) {
    return
  }
  writeDpapiSync(getDpapiFilePath(service, account), value)
}

// Silence unused-fs-import flags on macOS/Linux dev builds where this
// file's reading-side branches aren't exercised. The module is fine
// at runtime; the lint rule just doesn't know which platform we're on.
void readFileSync
void writeFileSync

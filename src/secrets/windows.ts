/**
 * @fileoverview Windows backend via PowerShell CredentialManager
 * module, with a DPAPI-encrypted file fallback.
 *
 * Two paths, tried in order:
 *
 *   1. CredentialManager PowerShell module
 *      (`New-StoredCredential` / `Get-StoredCredential` /
 *      `Remove-StoredCredential`). The cleanest path — stored
 *      credentials live in the Windows Credential Manager, the same
 *      place `cmdkey` writes to. Requires the module to be
 *      installed (`Install-Module CredentialManager -Scope CurrentUser`).
 *
 *   2. DPAPI-encrypted file under `%APPDATA%\<service>\<account>.enc`.
 *      Used when the CredentialManager module isn't available.
 *      `System.Security.Cryptography.ProtectedData` encrypts under
 *      the current-user machine key — readable only by this user on
 *      this machine, never plaintext.
 *
 * The target name composed for CredentialManager is `service:account`
 * (matching `cmdkey /generic:<target>` convention).
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const POWERSHELL_BIN = 'powershell'

export function buildTarget(service: string, account: string): string {
  return `${service}:${account}`
}

function getDpapiFilePath(service: string, account: string): string {
  const appData =
    process.env['APPDATA'] ?? path.join(homedir(), 'AppData', 'Roaming')
  return path.join(appData, service, `${account}.enc`)
}

function quotePs(value: string): string {
  // PowerShell single-quoted strings: escape embedded ' by doubling.
  return `'${value.replace(/'/g, "''")}'`
}

async function readDpapi(filePath: string): Promise<string | undefined> {
  if (!existsSync(filePath)) {
    return undefined
  }
  const script = `
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

function readDpapiSync(filePath: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined
  }
  const script = `
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

function runPsAsync(script: string, input?: string): Promise<{
  status: number | null
  stdout: string
  stderr: string
}> {
  return new Promise(resolve => {
    const child = spawn(
      POWERSHELL_BIN,
      ['-NoProfile', '-Command', script],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', () => resolve({ status: -1, stdout, stderr }))
    child.on('close', status => resolve({ status, stdout, stderr }))
    if (input !== undefined) {
      child.stdin.end(input)
    } else {
      child.stdin.end()
    }
  })
}

function runPsSync(script: string, input?: string): {
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

async function writeDpapi(filePath: string, value: string): Promise<void> {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const script = `
    $token = $input | Out-String
    $token = $token.Trim()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($token)
    $protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
    [Convert]::ToBase64String($protected) | Set-Content -Path ${quotePs(filePath)} -NoNewline
  `
  const r = await runPsAsync(script, value)
  if (r.status !== 0) {
    throw new Error(
      `DPAPI file write failed: ${r.stderr.trim()}. ` +
        'Install the CredentialManager PowerShell module (' +
        '`Install-Module CredentialManager -Scope CurrentUser`) for a cleaner storage path.',
    )
  }
}

function writeDpapiSync(filePath: string, value: string): void {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const script = `
    $token = $input | Out-String
    $token = $token.Trim()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($token)
    $protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
    [Convert]::ToBase64String($protected) | Set-Content -Path ${quotePs(filePath)} -NoNewline
  `
  const r = runPsSync(script, value)
  if (r.status !== 0) {
    throw new Error(
      `DPAPI file write failed: ${r.stderr.trim()}. ` +
        'Install the CredentialManager PowerShell module (' +
        '`Install-Module CredentialManager -Scope CurrentUser`) for a cleaner storage path.',
    )
  }
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
      const fsMod = require('node:fs') as typeof import('node:fs')
      fsMod.rmSync(filePath, { force: true })
      removedAny = true
    } catch {
      // best-effort
    }
  }
  return removedAny ? 'removed' : 'absent'
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

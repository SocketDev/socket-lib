/**
 * @fileoverview Cross-platform secret-storage helper. Reads / writes
 * to the native OS credential store (Keychain on macOS, Secret
 * Service via libsecret on Linux, Credential Manager + DPAPI on
 * Windows). Consumers pick their own `{ service, account }` pair.
 *
 * API shape:
 *
 *   readSecret({ service, account })         → Promise<string | undefined>
 *   readSecretSync({ service, account })     → string | undefined
 *   writeSecret({ service, account, value })  → Promise<void>
 *   writeSecretSync({ service, account, value }) → void
 *   deleteSecret({ service, account })       → Promise<'removed' | 'absent'>
 *   deleteSecretSync({ service, account })   → 'removed' | 'absent'
 *
 * Multi-slot helpers exist for the common case of writing the same
 * value under multiple account names (e.g. SOCKET_API_TOKEN +
 * SOCKET_API_KEY for backwards compatibility):
 *
 *   readSecretFromSlots({ service, accounts })
 *   writeSecretToSlots({ service, accounts, value })
 *   deleteSecretFromSlots({ service, accounts })
 *
 * IMPORTANT: do NOT invoke these helpers from a shell rc / .zshenv
 * file (or any other always-on-startup hook). On macOS each call
 * triggers a Keychain auth prompt; piling that into per-shell
 * startup floods the user with prompts. Use `materializeToShellRc`
 * from `./shell-env` to write a one-time literal `export` block
 * instead. (Incident memory: socket-cli session 2026-05-15.)
 */

import { platform } from 'node:os'

import {
  deleteMacOS,
  deleteMacOSSync,
  isMacOSBackendAvailable,
  readMacOS,
  readMacOSSync,
  writeMacOS,
  writeMacOSSync,
} from './_macos'
import {
  deleteLinux,
  deleteLinuxSync,
  isLinuxBackendAvailable,
  readLinux,
  readLinuxSync,
  writeLinux,
  writeLinuxSync,
} from './_linux'
import {
  deleteWindows,
  deleteWindowsSync,
  isWindowsBackendAvailable,
  readWindows,
  readWindowsSync,
  writeWindows,
  writeWindowsSync,
} from './_windows'
import type {
  BackendAvailability,
  SecretDeleteResult,
  SecretWriteResult,
} from './types'

export type {
  BackendAvailability,
  SecretDeleteResult,
  SecretWriteResult,
} from './types'
export type { SecretSlot } from './types'

type Platform = 'darwin' | 'linux' | 'win32' | 'other'

function detectPlatform(): Platform {
  const p = platform()
  if (p === 'darwin' || p === 'linux' || p === 'win32') {
    return p
  }
  return 'other'
}

export interface ReadOptions {
  service: string
  account: string
}

/**
 * Read a single secret value from the OS credential store. Returns
 * `undefined` when the entry doesn't exist OR when the backend tool
 * isn't available — read paths never throw, so callers can fall
 * through to env / .env / prompt cleanly.
 */
export async function readSecret({
  service,
  account,
}: ReadOptions): Promise<string | undefined> {
  switch (detectPlatform()) {
    case 'darwin':
      return readMacOS(service, account)
    case 'linux':
      return readLinux(service, account)
    case 'win32':
      return readWindows(service, account)
    default:
      return undefined
  }
}

export function readSecretSync({
  service,
  account,
}: ReadOptions): string | undefined {
  switch (detectPlatform()) {
    case 'darwin':
      return readMacOSSync(service, account)
    case 'linux':
      return readLinuxSync(service, account)
    case 'win32':
      return readWindowsSync(service, account)
    default:
      return undefined
  }
}

export interface ReadFromSlotsOptions {
  service: string
  accounts: readonly string[]
}

/**
 * Read from the first matching account. Used when multiple env-var
 * names map to the same logical secret (e.g. SOCKET_API_TOKEN
 * canonical + SOCKET_API_KEY legacy). Returns the value AND the
 * account it came from so callers can warn on legacy hits.
 */
export async function readSecretFromSlots({
  service,
  accounts,
}: ReadFromSlotsOptions): Promise<
  { value: string; account: string } | undefined
> {
  for (const account of accounts) {
    const value = await readSecret({ service, account })
    if (value) {
      return { value, account }
    }
  }
  return undefined
}

export function readSecretFromSlotsSync({
  service,
  accounts,
}: ReadFromSlotsOptions): { value: string; account: string } | undefined {
  for (const account of accounts) {
    const value = readSecretSync({ service, account })
    if (value) {
      return { value, account }
    }
  }
  return undefined
}

export interface WriteOptions {
  service: string
  account: string
  value: string
  /**
   * Display label shown in Keychain Access.app / GNOME keyring etc.
   * Defaults to `<service> credential`. Per-secret labels make the
   * keyring UI navigable when a service has multiple entries.
   */
  label?: string | undefined
}

/**
 * Persist a single secret to the OS credential store. Throws on
 * write failure — the caller is in a setup flow and should see why
 * persistence failed, not silently continue.
 */
export async function writeSecret({
  service,
  account,
  value,
  label,
}: WriteOptions): Promise<void> {
  if (!value || typeof value !== 'string') {
    throw new TypeError('writeSecret: value must be a non-empty string')
  }
  const platform_ = detectPlatform()
  if (platform_ === 'other') {
    throw new Error(
      `Unsupported platform: ${platform()}. ` +
        'Secret storage requires macOS, Linux, or Windows.',
    )
  }
  const lbl = label ?? `${service} credential`
  switch (platform_) {
    case 'darwin':
      await writeMacOS(service, account, value, lbl)
      return
    case 'linux':
      await writeLinux(service, account, value, lbl)
      return
    case 'win32':
      await writeWindows(service, account, value, lbl)
      return
  }
}

export function writeSecretSync({
  service,
  account,
  value,
  label,
}: WriteOptions): void {
  if (!value || typeof value !== 'string') {
    throw new TypeError('writeSecret: value must be a non-empty string')
  }
  const platform_ = detectPlatform()
  if (platform_ === 'other') {
    throw new Error(
      `Unsupported platform: ${platform()}. ` +
        'Secret storage requires macOS, Linux, or Windows.',
    )
  }
  const lbl = label ?? `${service} credential`
  switch (platform_) {
    case 'darwin':
      writeMacOSSync(service, account, value, lbl)
      return
    case 'linux':
      writeLinuxSync(service, account, value, lbl)
      return
    case 'win32':
      writeWindowsSync(service, account, value, lbl)
      return
  }
}

export interface WriteToSlotsOptions {
  service: string
  accounts: readonly string[]
  value: string
  label?: string | undefined
}

/**
 * Persist the same value under each account name in `accounts`.
 * Useful when a value needs to be reachable under several env-var
 * names (legacy aliases, sibling tools). Each slot gets its own
 * keychain entry — they all hold the same string.
 *
 * If any individual write throws, prior writes have already
 * persisted. Failures aren't rolled back (the half-state is at
 * worst a stale legacy alias, which the next successful write
 * cleans up).
 */
export async function writeSecretToSlots({
  service,
  accounts,
  value,
  label,
}: WriteToSlotsOptions): Promise<SecretWriteResult[]> {
  const results: SecretWriteResult[] = []
  for (const account of accounts) {
    await writeSecret({ service, account, value, label })
    results.push({ account, outcome: 'written' })
  }
  return results
}

export function writeSecretToSlotsSync({
  service,
  accounts,
  value,
  label,
}: WriteToSlotsOptions): SecretWriteResult[] {
  const results: SecretWriteResult[] = []
  for (const account of accounts) {
    writeSecretSync({ service, account, value, label })
    results.push({ account, outcome: 'written' })
  }
  return results
}

export interface DeleteOptions {
  service: string
  account: string
}

/**
 * Remove a secret from the OS credential store. Idempotent —
 * succeeds whether the entry exists or not. Returns the per-slot
 * outcome so callers can log "actually removed X" vs "X was
 * already absent."
 */
export async function deleteSecret({
  service,
  account,
}: DeleteOptions): Promise<'removed' | 'absent'> {
  switch (detectPlatform()) {
    case 'darwin':
      return deleteMacOS(service, account)
    case 'linux':
      return deleteLinux(service, account)
    case 'win32':
      return deleteWindows(service, account)
    default:
      return 'absent'
  }
}

export function deleteSecretSync({
  service,
  account,
}: DeleteOptions): 'removed' | 'absent' {
  switch (detectPlatform()) {
    case 'darwin':
      return deleteMacOSSync(service, account)
    case 'linux':
      return deleteLinuxSync(service, account)
    case 'win32':
      return deleteWindowsSync(service, account)
    default:
      return 'absent'
  }
}

export interface DeleteFromSlotsOptions {
  service: string
  accounts: readonly string[]
}

export async function deleteSecretFromSlots({
  service,
  accounts,
}: DeleteFromSlotsOptions): Promise<SecretDeleteResult[]> {
  const results: SecretDeleteResult[] = []
  for (const account of accounts) {
    const outcome = await deleteSecret({ service, account })
    results.push({ account, outcome })
  }
  return results
}

export function deleteSecretFromSlotsSync({
  service,
  accounts,
}: DeleteFromSlotsOptions): SecretDeleteResult[] {
  const results: SecretDeleteResult[] = []
  for (const account of accounts) {
    const outcome = deleteSecretSync({ service, account })
    results.push({ account, outcome })
  }
  return results
}

/**
 * Diagnostic: tell the operator whether the OS credential backend
 * is reachable. Used by installers to report up-front (before any
 * prompt fires) when libsecret-tools or the CredentialManager
 * module aren't installed.
 */
export function getBackendAvailability(): BackendAvailability {
  const platform_ = detectPlatform()
  switch (platform_) {
    case 'darwin': {
      return {
        available: isMacOSBackendAvailable(),
        toolName: 'security(1)',
        installHint: undefined,
      }
    }
    case 'linux': {
      const available = isLinuxBackendAvailable()
      return {
        available,
        toolName: 'secret-tool',
        installHint: available
          ? undefined
          : 'apt install libsecret-tools  (Debian/Ubuntu) | ' +
            'dnf install libsecret  (Fedora/RHEL)',
      }
    }
    case 'win32': {
      return {
        available: isWindowsBackendAvailable(),
        toolName: 'PowerShell (CredentialManager / DPAPI)',
        installHint: undefined,
      }
    }
    default:
      return {
        available: false,
        toolName: 'n/a',
        installHint: `Platform ${platform()} is not supported.`,
      }
  }
}

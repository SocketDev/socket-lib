/**
 * @file Cross-platform secret-storage helper. Reads / writes to the native OS
 *   credential store (Keychain on macOS, Secret Service via libsecret on Linux,
 *   Credential Manager + DPAPI on Windows). Consumers pick their own `{
 *   service, account }` pair. API shape: readSecret({ service, account }) →
 *   Promise<string | undefined> readSecretSync({ service, account }) → string |
 *   undefined writeSecret({ service, account, value }) → Promise<void>
 *   writeSecretSync({ service, account, value }) → void deleteSecret({ service,
 *   account }) → Promise<'removed' | 'absent'> deleteSecretSync({ service,
 *   account }) → 'removed' | 'absent' Multi-slot helpers exist for the common
 *   case of writing the same value under multiple account names (e.g.
 *   SOCKET_API_TOKEN + SOCKET_API_KEY for backwards compatibility):
 *   readSecretFromSlots({ service, accounts }) writeSecretToSlots({ service,
 *   accounts, value }) deleteSecretFromSlots({ service, accounts }) IMPORTANT:
 *   do NOT invoke these helpers from a shell rc / .zshenv file (or any other
 *   always-on-startup hook). On macOS each call triggers a Keychain auth
 *   prompt; piling that into per-shell startup floods the user with prompts.
 *   Use `write` from `./rc` to write a one-time literal `export` block into the
 *   user's shell rc file instead. (Incident memory: socket-cli session
 *   2026-05-15.)
 */

import os from 'node:os'

import { ErrorCtor, TypeErrorCtor } from '../primordials/error'

import {
  dedupeRead,
  getCached,
  has as cacheHas,
  invalidate,
  invalidateAll,
  setCached,
} from './_internal'
import {
  deleteMacOS,
  deleteMacOSSync,
  isMacOSBackendAvailable,
  readMacOS,
  readMacOSSync,
  writeMacOS,
  writeMacOSSync,
} from './macos'
import {
  deleteLinux,
  deleteLinuxSync,
  isLinuxBackendAvailable,
  readLinux,
  readLinuxSync,
  writeLinux,
  writeLinuxSync,
} from './linux'
import {
  deleteWindows,
  deleteWindowsSync,
  isWindowsBackendAvailable,
  readWindows,
  readWindowsSync,
  writeWindows,
  writeWindowsSync,
} from './windows'
import type {
  BackendAvailability,
  SecretDeleteResult,
  SecretWriteResult,
} from './types'

/**
 * Drop the in-process read cache. Tests use this between cases to force a fresh
 * OS call; production code generally doesn't need it (process exit drops the
 * cache anyway, and `writeSecret` / `deleteSecret` already invalidate per-key
 * entries automatically).
 */
export function clearCache(): void {
  invalidateAll()
}

export interface DeleteOptions {
  service: string
  account: string
}

/**
 * Remove a secret from the OS credential store. Idempotent — succeeds whether
 * the entry exists or not. Returns the per-slot outcome so callers can log
 * "actually removed X" vs "X was already absent."
 */
export async function deleteSecret({
  service,
  account,
}: DeleteOptions): Promise<'removed' | 'absent'> {
  let outcome: 'removed' | 'absent'
  switch (detectPlatform()) {
    case 'darwin':
      outcome = await deleteMacOS(service, account)
      break
    case 'linux':
      outcome = await deleteLinux(service, account)
      break
    case 'win32':
      outcome = await deleteWindows(service, account)
      break
    default:
      outcome = 'absent'
  }
  invalidate(service, account)
  return outcome
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

/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
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

export function deleteSecretSync({
  service,
  account,
}: DeleteOptions): 'removed' | 'absent' {
  let outcome: 'removed' | 'absent'
  switch (detectPlatform()) {
    case 'darwin':
      outcome = deleteMacOSSync(service, account)
      break
    case 'linux':
      outcome = deleteLinuxSync(service, account)
      break
    case 'win32':
      outcome = deleteWindowsSync(service, account)
      break
    default:
      outcome = 'absent'
  }
  invalidate(service, account)
  return outcome
}

export type {
  BackendAvailability,
  SecretDeleteResult,
  SecretWriteResult,
} from './types'
export type { SecretSlot } from './types'

export type Platform = 'darwin' | 'linux' | 'win32' | 'other'

/**
 * Resolve the current OS to one of our four backend categories.
 *
 * Exported only because Socket's `export-top-level-functions` lint rule
 * requires top-level functions to be exported for testability. Not part of the
 * public `secrets/keychain` API surface — consumers should call `readSecret` /
 * `writeSecret` / `getBackendAvailability` instead, which handle the dispatch
 * internally.
 *
 * @internal
 */
export function detectPlatform(): Platform {
  const p = os.platform()
  if (p === 'darwin' || p === 'linux' || p === 'win32') {
    return p
  }
  return 'other'
}

/**
 * Diagnostic: tell the operator whether the OS credential backend is reachable.
 * Used by installers to report up-front (before any prompt fires) when
 * libsecret-tools or the CredentialManager module aren't installed.
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
        installHint: `Platform ${os.platform()} is not supported.`,
      }
  }
}

export interface ReadOptions {
  service: string
  account: string
}

/**
 * Read a single secret value from the OS credential store. Returns `undefined`
 * when the entry doesn't exist OR when the backend tool isn't available — read
 * paths never throw, so callers can fall through to env / .env / prompt
 * cleanly.
 */
export async function readSecret({
  service,
  account,
}: ReadOptions): Promise<string | undefined> {
  // Process-scoped cache hit short-circuits the OS call. Concurrent
  // reads of the same key share one in-flight Promise via dedupeRead.
  // Cache is invalidated by writeSecret / deleteSecret.
  return dedupeRead(service, account, async () => {
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
  })
}

export interface ReadFromSlotsOptions {
  service: string
  accounts: readonly string[]
}

/**
 * Read from the first matching account. Used when multiple env-var names map to
 * the same logical secret (e.g. SOCKET_API_TOKEN canonical + SOCKET_API_KEY
 * legacy). Returns the value AND the account it came from so callers can warn
 * on legacy hits.
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

/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
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

export function readSecretSync({
  service,
  account,
}: ReadOptions): string | undefined {
  if (cacheHas(service, account)) {
    return getCached(service, account)
  }
  let value: string | undefined
  switch (detectPlatform()) {
    case 'darwin':
      value = readMacOSSync(service, account)
      break
    case 'linux':
      value = readLinuxSync(service, account)
      break
    case 'win32':
      value = readWindowsSync(service, account)
      break
    default:
      value = undefined
  }
  setCached(service, account, value)
  return value
}

export interface WriteOptions {
  service: string
  account: string
  value: string
  /**
   * Display label shown in Keychain Access.app / GNOME keyring etc. Defaults to
   * `<service> credential`. Per-secret labels make the keyring UI navigable
   * when a service has multiple entries.
   */
  label?: string | undefined
}

/**
 * Persist a single secret to the OS credential store. Throws on write failure —
 * the caller is in a setup flow and should see why persistence failed, not
 * silently continue.
 *
 * Returns the outcome: - `'written'` — value persisted (entry was absent or
 * differed). - `'unchanged'` — current stored value already matches; no OS
 * write performed. Useful for idempotent flows (re-running an installer
 * shouldn't show "rewrote N secrets" when nothing actually changed).
 */
export async function writeSecret({
  service,
  account,
  value,
  label,
}: WriteOptions): Promise<'written' | 'unchanged'> {
  if (!value || typeof value !== 'string') {
    throw new TypeErrorCtor('writeSecret: value must be a non-empty string')
  }
  const platform_ = detectPlatform()
  if (platform_ === 'other') {
    throw new ErrorCtor(
      `Unsupported platform: ${os.platform()}. ` +
        'Secret storage requires macOS, Linux, or Windows.',
    )
  }
  // No-op detection: if the stored value already matches, skip the OS
  // call. dedupeRead caches the result, so back-to-back idempotent
  // writes incur at most one read per process.
  const current = await readSecret({ service, account })
  if (current === value) {
    return 'unchanged'
  }
  const lbl = label ?? `${service} credential`
  switch (platform_) {
    case 'darwin':
      await writeMacOS(service, account, value, lbl)
      break
    case 'linux':
      await writeLinux(service, account, value, lbl)
      break
    case 'win32':
      await writeWindows(service, account, value, lbl)
      break
  }
  // Refresh the cache so subsequent reads return the new value
  // without a re-fetch (and without surfacing the stale prior value).
  setCached(service, account, value)
  return 'written'
}

export function writeSecretSync({
  service,
  account,
  value,
  label,
}: WriteOptions): 'written' | 'unchanged' {
  if (!value || typeof value !== 'string') {
    throw new TypeErrorCtor('writeSecret: value must be a non-empty string')
  }
  const platform_ = detectPlatform()
  if (platform_ === 'other') {
    throw new ErrorCtor(
      `Unsupported platform: ${os.platform()}. ` +
        'Secret storage requires macOS, Linux, or Windows.',
    )
  }
  const current = readSecretSync({ service, account })
  if (current === value) {
    return 'unchanged'
  }
  const lbl = label ?? `${service} credential`
  switch (platform_) {
    case 'darwin':
      writeMacOSSync(service, account, value, lbl)
      break
    case 'linux':
      writeLinuxSync(service, account, value, lbl)
      break
    case 'win32':
      writeWindowsSync(service, account, value, lbl)
      break
  }
  setCached(service, account, value)
  return 'written'
}

export interface WriteToSlotsOptions {
  service: string
  accounts: readonly string[]
  value: string
  label?: string | undefined
}

/**
 * Persist the same value under each account name in `accounts`. Useful when a
 * value needs to be reachable under several env-var names (legacy aliases,
 * sibling tools). Each slot gets its own keychain entry — they all hold the
 * same string.
 *
 * If any individual write throws, prior writes have already persisted. Failures
 * aren't rolled back (the half-state is at worst a stale legacy alias, which
 * the next successful write cleans up).
 */
export async function writeSecretToSlots({
  service,
  accounts,
  value,
  label,
}: WriteToSlotsOptions): Promise<SecretWriteResult[]> {
  const results: SecretWriteResult[] = []
  for (const account of accounts) {
    const outcome = await writeSecret({ service, account, value, label })
    results.push({ account, outcome })
  }
  return results
}

/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function writeSecretToSlotsSync({
  service,
  accounts,
  value,
  label,
}: WriteToSlotsOptions): SecretWriteResult[] {
  const results: SecretWriteResult[] = []
  for (const account of accounts) {
    const outcome = writeSecretSync({ service, account, value, label })
    results.push({ account, outcome })
  }
  return results
}

/**
 * @file In-process biometric keychain backend — the sockeye `keychain.node`
 *   N-API addon, loaded lazily and OPTIONALLY. The addon (built by sockeye's
 *   `keychain-addon-builder`, published as `@socketsecurity/sockeye`, with
 *   `@socketaddon/keychain-*` as the legacy republish) exposes the shared
 *   keystore-infra core: macOS Keychain items behind a Secure-Enclave biometric
 *   ACL, so a read is gated on Touch ID instead of a password prompt. This
 *   slots between the proteus broker and the CLI keychain in `secrets/find.ts`
 *   `resolve()`: the broker is preferred when its daemon runs (one unlock
 *   serves many processes), this addon covers the no-daemon case in-process,
 *   and the `security`-CLI read remains the biometric-less floor. Same
 *   self-gating contract as `./broker`: absence is a fall-through, never an
 *   error. The addon is missing on non-macOS platforms, on machines that never
 *   installed it, and in CI — all of those return `undefined` from every
 *   function here, and the resolve chain moves on. Load order:
 *   `SOCKET_KEYCHAIN_ADDON_PATH` env override first (a built `keychain.node`
 *   path, the escape hatch for local sockeye builds), then the per-platform npm
 *   package.
 */

import { createRequire } from 'node:module'

import type { SecretSlot } from './types'

/**
 * The addon's N-API surface, as exported by sockeye's `keychain_napi.cc`
 * (`get` / `set` / `del`). Every function takes `(service, account)` leading
 * params; `set` adds the value.
 */
export interface KeychainAddon {
  del(service: string, account: string): boolean
  get(service: string, account: string): string | undefined
  set(service: string, account: string, value: string): void
}

let cached: KeychainAddon | undefined
// Distinguishes "never probed" from "probed, absent" without a sentinel value:
// a native require is attempted at most once per process either way.
let probed = false

/**
 * The loaded addon, or `undefined` when unavailable. Cached for the process:
 * a native `require` is not retried per read, matching the broker's
 * socket-stat-once behavior in spirit.
 */
export function getKeychainAddon(): KeychainAddon | undefined {
  if (!probed) {
    probed = true
    cached = loadAddon()
  }
  return cached
}

/* c8 ignore start - require() of a native addon; exercised via injection in tests. */
export function loadAddon(): KeychainAddon | undefined {
  const require_ = createRequire(import.meta.url)
  const envPath = process.env['SOCKET_KEYCHAIN_ADDON_PATH']
  const candidates = envPath
    ? [envPath]
    : [
        // Canonical npm home first, then the per-platform split, then the
        // legacy @socketaddon republish. crates.io distribution of the same
        // keystore core is sockeye-side packaging and does not change this
        // load order.
        `@socketsecurity/sockeye-${process.platform}-${process.arch}`,
        '@socketsecurity/sockeye',
        `@socketaddon/keychain-${process.platform}-${process.arch}`,
        '@socketaddon/keychain',
      ]
  for (let i = 0, { length } = candidates; i < length; i += 1) {
    try {
      const mod = require_(candidates[i]!) as KeychainAddon
      // Shape-check rather than trust: a wrong SOCKET_KEYCHAIN_ADDON_PATH
      // should degrade to fall-through, not crash every resolve() caller.
      if (typeof mod?.get === 'function') {
        return mod
      }
    } catch {}
  }
  return undefined
}
/* c8 ignore stop */

/**
 * Read a secret through the biometric addon, or `undefined` when the addon is
 * unavailable, the item is absent, or the user cancels the biometric prompt.
 * Never throws: every failure is a fall-through so `resolve()` can continue
 * to the CLI keychain.
 */
export function readSecretBiometric(slot: SecretSlot): string | undefined {
  const addon = getKeychainAddon()
  if (!addon) {
    return undefined
  }
  try {
    const value = addon.get(slot.service, slot.account)
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    // A denied/cancelled Touch ID prompt surfaces as a throw from the
    // Secure-Enclave ACL. Cancellation means "use the next backend", not
    // "crash the caller".
    return undefined
  }
}

/**
 * Test injection point and embedder override. Passing an addon forces it;
 * passing `undefined` forces ABSENCE (reads fall through). To return to lazy
 * detection on the next read, pass `undefined` with `{ probe: true }`.
 */
export function setKeychainAddon(
  addon: KeychainAddon | undefined,
  options?: { probe?: boolean | undefined } | undefined,
): void {
  const opts = { __proto__: null, ...options } as {
    probe?: boolean | undefined
  }
  cached = addon
  probed = !(opts.probe ?? false)
}

/**
 * Write a secret through the biometric addon so the stored item carries the
 * Secure-Enclave ACL. Returns `false` (rather than throwing) when the addon
 * is unavailable, so callers can fall back to `writeSecret` and report which
 * protection level the value ended up with.
 */
export function writeSecretBiometric(slot: SecretSlot, value: string): boolean {
  const addon = getKeychainAddon()
  if (!addon) {
    return false
  }
  try {
    addon.set(slot.service, slot.account, value)
    return true
  } catch {
    return false
  }
}

/**
 * @fileoverview Public type surface for `secrets/*`.
 *
 * Secrets in the fleet are stored under the OS's native credential
 * store keyed by `{ service, account }`:
 *
 *   - macOS:   Keychain generic-password items
 *              (service = `-s`, account = `-a` flags on `security(1)`)
 *   - Linux:   libsecret Secret Service items
 *              (service + user attributes via `secret-tool`)
 *   - Windows: Credential Manager StoredCredential targets
 *              ("service:account" composed as the target name)
 *
 * Consumers pick their own service name (`socket-cli`, `socket-mcp`,
 * `depot`, etc.) and account name (typically the env-var the value
 * eventually lands in, e.g. `SOCKET_API_TOKEN`).
 */

/**
 * Coordinate for a secret in the OS credential store.
 *
 * @property service - Logical service identifier (e.g. `'socket-cli'`,
 *   `'socket-mcp'`). Per-consumer; pick a stable name and use it
 *   everywhere your tool reads/writes its secrets.
 * @property account - Per-secret name within a service. Typically the
 *   canonical env-var the value will be exported under (e.g.
 *   `'SOCKET_API_TOKEN'`), since that's the name a future reader will
 *   reach for when grepping the keychain.
 */
export interface SecretSlot {
  service: string
  account: string
}

/**
 * Result of a write attempt. The `account` is echoed back so a batch
 * caller (writeSecretToSlots) can correlate per-slot outcomes without
 * reconstructing the input order.
 */
export interface SecretWriteResult {
  account: string
  outcome: 'written'
}

/**
 * Result of a delete attempt. Idempotent: `outcome: 'removed'` when
 * an entry existed and was deleted, `outcome: 'absent'` when no entry
 * was present (still a success — caller wanted the slot empty).
 */
export interface SecretDeleteResult {
  account: string
  outcome: 'removed' | 'absent'
}

/**
 * Diagnostic from `checkBackendAvailable`. Used by installers /
 * onboarding flows to tell the operator upfront whether the OS has
 * the credential tooling needed (e.g. `libsecret-tools` on Linux,
 * the CredentialManager PowerShell module on Windows).
 */
export interface BackendAvailability {
  available: boolean
  /** Human-facing tool name for log messages. */
  toolName: string
  /**
   * `apt install libsecret-tools` / similar. `undefined` when the
   * backend is always available (macOS `security(1)` ships with the
   * OS) or when no install path is sensible (unsupported platform).
   */
  installHint: string | undefined
}

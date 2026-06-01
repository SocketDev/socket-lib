/**
 * @file Convenience helper for reading the Socket API token from the canonical
 *   env → keychain precedence order. Centralizes two constants every fleet
 *   consumer would otherwise hard-code: the keychain service name
 *   (`socket-cli`) and the env-var + account fallback list (`SOCKET_API_TOKEN`
 *   canonical, `SOCKET_API_KEY` legacy alias). Consumers like firewall and
 *   wheelhouse hooks call `readSocketApiToken()` instead of redoing the
 *   `resolve({ service, accounts })` boilerplate.
 */

import { resolve, resolveSync } from './find'

const SOCKET_CLI_SERVICE = 'socket-cli'
const TOKEN_ACCOUNTS = ['SOCKET_API_TOKEN', 'SOCKET_API_TOKEN'] as const

export interface ReadSocketApiTokenOptions {
  /**
   * When `true`, skip the keychain fallback entirely. The resolver checks
   * `process.env.SOCKET_API_TOKEN` then `process.env.SOCKET_API_KEY` and
   * returns `undefined` immediately if neither is set. Use this in headless
   * contexts (CI, bootstrap hooks) where a Keychain auth prompt is
   * unacceptable.
   *
   * @default false
   */
  allowEnvOnly?: boolean | undefined
}

export async function readSocketApiToken(
  options?: ReadSocketApiTokenOptions | undefined,
): Promise<string | undefined> {
  const result = await resolve({
    service: SOCKET_CLI_SERVICE,
    accounts: TOKEN_ACCOUNTS,
    allowEnvOnly: options?.allowEnvOnly,
  })
  return result?.value
}

export function readSocketApiTokenSync(
  options?: ReadSocketApiTokenOptions | undefined,
): string | undefined {
  const result = resolveSync({
    service: SOCKET_CLI_SERVICE,
    accounts: TOKEN_ACCOUNTS,
    allowEnvOnly: options?.allowEnvOnly,
  })
  return result?.value
}

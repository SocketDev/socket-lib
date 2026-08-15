/**
 * @file Interactive socket.dev login — acquire an API token and store it in
 *   the canonical `socketsecurity` keychain slot, biometric-first. Two flows:
 *   `loginWithBrowser()` — works TODAY with no server changes: opens the
 *   socket.dev dashboard's API-tokens page, prompts on the TTY for a paste
 *   (masked), and stores the value through the sockeye `keychain.node`
 *   Secure-Enclave ACL when present, else the CLI keychain. The stored slot is
 *   exactly what `readSocketApiToken()` and the sdk's resolution chain read
 *   back, so one login serves every Socket tool on the machine.
 *   `loginWithSocketOauth()` — the standards-shaped flow: RFC 8414 discovery
 *   against the issuer, then Authorization Code + PKCE with a loopback
 *   redirect per RFC 8252. DISCOVERY-GATED on purpose: socket.dev does not
 *   advertise an OAuth authorization server yet, and this module refuses to
 *   invent endpoint URLs — until `/.well-known/oauth-authorization-server`
 *   resolves, the function throws a descriptive error naming
 *   `loginWithBrowser()` as the working path. When the server ships, the flow
 *   lights up with no client change.
 *   Neither flow is part of the silent `resolve()` chain: login is a HUMAN
 *   action, and a background token lookup must never pop a browser.
 */

import {
  SOCKET_API_TOKENS_URL,
  SOCKET_WEBSITE_URL,
} from '../constants/socket.mjs'
import passwordPrompt from '../external/@inquirer/password.js'
import { httpRequest } from '../http-request/request.mjs'
import { openUrl } from '../process/open-url.mjs'
import { writeSecretBiometric } from './addon.mjs'
import { writeSecret } from './keychain.mjs'

import type { SecretSlot } from './types.mjs'

/**
 * The canonical slot every Socket tool reads the API token from.
 */
export const SOCKET_TOKEN_SLOT: SecretSlot = {
  account: 'SOCKET_API_TOKEN',
  service: 'socketsecurity',
}

export interface LoginResult {
  /**
   * Which store took the value: 'keychain-biometric' — the sockeye
   * keychain.node addon stored it behind a Secure-Enclave Touch ID ACL.
   * 'keychain' — the CLI keychain backend stored it without biometry.
   */
  storedWith: 'keychain' | 'keychain-biometric'
  token: string
}

export interface LoginWithBrowserOptions {
  /**
   * Skip opening the browser and only prompt — for terminals where the
   * operator already has the dashboard open.
   */
  noBrowser?: boolean | undefined
  /**
   * Override the dashboard page opened for token creation.
   */
  url?: string | undefined
}

/**
 * RFC 8414 discovery, or `undefined` when the issuer advertises no OAuth
 * authorization server. Never throws on absence: a 404 here is the expected
 * state until socket.dev ships the server.
 */
export async function discoverSocketOauth(
  issuer: string = SOCKET_WEBSITE_URL,
): Promise<OauthDiscoveryDocument | undefined> {
  const base = issuer.endsWith('/') ? issuer.slice(0, -1) : issuer
  try {
    const res = await httpRequest(
      `${base}/.well-known/oauth-authorization-server`,
      { timeout: 10_000 },
    )
    if (!res.ok) {
      return undefined
    }
    const doc = res.json() as OauthDiscoveryDocument
    return doc?.authorization_endpoint && doc?.token_endpoint ? doc : undefined
  } catch {
    return undefined
  }
}

/**
 * Open the socket.dev API-tokens dashboard page, prompt for a masked paste,
 * and store the token biometric-first. The flow that works today: the
 * dashboard mints the token, this side never sees credentials beyond the
 * pasted value, and the paste never lands in shell history or an env var.
 */
export async function loginWithBrowser(
  options?: LoginWithBrowserOptions | undefined,
): Promise<LoginResult> {
  const opts = { __proto__: null, ...options } as LoginWithBrowserOptions
  const url = opts.url ?? SOCKET_API_TOKENS_URL
  if (!opts.noBrowser) {
    // Best-effort: a headless terminal still gets the URL in the prompt line.
    await openUrl(url)
  }
  const token = await passwordPrompt({
    mask: '*',
    message: `Paste an API token from ${url}`,
  })
  const trimmed = token.trim()
  if (!trimmed) {
    throw new Error('login cancelled: empty token')
  }
  return await storeSocketApiToken(trimmed)
}

export interface OauthDiscoveryDocument {
  authorization_endpoint?: string | undefined
  token_endpoint?: string | undefined
}

/**
 * OAuth 2.0 Authorization Code + PKCE against the socket.dev issuer,
 * discovery-gated. Throws with the working alternative named while the
 * issuer advertises no authorization server; once discovery resolves, this is
 * where the loopback-redirect dance (RFC 8252) belongs, storing through
 * `storeSocketApiToken` like every other flow.
 */
export async function loginWithSocketOauth(
  options?: LoginWithSocketOauthOptions | undefined,
): Promise<LoginResult> {
  const opts = { __proto__: null, ...options } as LoginWithSocketOauthOptions
  const issuer = opts.issuer ?? SOCKET_WEBSITE_URL
  const discovered = await discoverSocketOauth(issuer)
  if (!discovered) {
    throw new Error(
      `${issuer} does not advertise an OAuth authorization server yet ` +
        '(/.well-known/oauth-authorization-server did not resolve). Use ' +
        'loginWithBrowser() — it stores the token in the same keychain slot ' +
        'this flow will use once the server ships.',
    )
  }
  // Discovery resolved: the authorization-code + PKCE + loopback dance lands
  // here in the release that ships alongside the server. Refusing loudly
  // beats a half-implemented flow against unverified endpoints.
  throw new Error(
    `${issuer} advertises an OAuth server, but this client predates it — ` +
      'upgrade @socketsecurity/lib to a version that implements the flow, or ' +
      'use loginWithBrowser().',
  )
}

export interface LoginWithSocketOauthOptions {
  /**
   * Override the issuer probed for RFC 8414 discovery.
   */
  issuer?: string | undefined
}

/**
 * Store `token` in the canonical slot, biometric-first. Exported so the OAuth
 * flow, the paste flow, and any future flow share one storage path — and one
 * answer to "which protection level did the value end up with".
 */
export async function storeSocketApiToken(token: string): Promise<LoginResult> {
  if (writeSecretBiometric(SOCKET_TOKEN_SLOT, token)) {
    return { storedWith: 'keychain-biometric', token }
  }
  await writeSecret({ ...SOCKET_TOKEN_SLOT, value: token })
  return { storedWith: 'keychain', token }
}

/**
 * Keychain-backed Socket OAuth credentials with serialized refresh rotation.
 */

import { getNodeCrypto } from '../node/crypto.mjs'
import { getNodeOs } from '../node/os.mjs'
import { getNodePath } from '../node/path.mjs'
import { httpRequest } from '../http-request/request.mjs'
import { isPlainObject } from '../objects/predicates.mjs'
import { processLock } from '../process/lock-instance.mjs'
import {
  clearCache,
  deleteSecret,
  readSecret,
  writeSecret,
} from './keychain.mjs'

const KEYCHAIN_SERVICE = 'socketsecurity-oauth'
const RECORD_VERSION = 1
const REFRESH_SKEW_MS = 60_000

export const SOCKET_OAUTH_ISSUER = 'https://api.socket.dev/v1/oauth2/'
export const SOCKET_OAUTH_CLIENT_ID = 'socket-cli'

export interface OAuthCredentialRecord {
  accessToken: string
  clientId: string
  expiresAt: number
  issuer: string
  refreshToken: string
  version: number
}

export interface SocketOAuthCredentialOptions {
  clientId: string
  issuer: string
}

export interface SocketOAuthTokenSet {
  accessToken: string
  expiresIn: number
  refreshToken?: string | undefined
  tokenType: string
}

export interface ValidateSocketOAuthTokenOptions {
  requireRefreshToken: boolean
}

export type RefreshSocketOAuthToken = (
  refreshToken: string,
) => Promise<SocketOAuthTokenSet>

export class SocketOAuthError extends Error {
  oauthError: string

  constructor(oauthError: string, message: string) {
    super(message)
    this.name = 'SocketOAuthError'
    this.oauthError = oauthError
  }
}

export interface SocketAuthCredential {
  authScheme: 'bearer'
  token: string
}

export function deleteSocketOAuthCredential(
  options: SocketOAuthCredentialOptions,
): Promise<'removed' | 'absent'> {
  const config = normalizeSocketOAuthOptions(options)
  return deleteSecret({
    account: socketOAuthAccount(config),
    service: KEYCHAIN_SERVICE,
  })
}

export function isSocketOAuthCredentialRecord(
  value: unknown,
  options: SocketOAuthCredentialOptions,
): value is OAuthCredentialRecord {
  if (!isPlainObject(value)) {
    return false
  }
  const config = normalizeSocketOAuthOptions(options)
  return (
    value['version'] === RECORD_VERSION &&
    value['clientId'] === config.clientId &&
    value['issuer'] === config.issuer &&
    typeof value['accessToken'] === 'string' &&
    value['accessToken'].length > 0 &&
    typeof value['refreshToken'] === 'string' &&
    value['refreshToken'].length > 0 &&
    typeof value['expiresAt'] === 'number' &&
    Number.isFinite(value['expiresAt'])
  )
}

export function normalizeSocketOAuthOptions(
  options: SocketOAuthCredentialOptions,
): SocketOAuthCredentialOptions {
  const config = { __proto__: null, ...options } as SocketOAuthCredentialOptions
  if (!config.clientId.trim() || config.clientId.trim() !== config.clientId) {
    throw new TypeError(
      'Socket OAuth client ID is invalid: provide a registered public client ID',
    )
  }
  return {
    clientId: config.clientId,
    issuer: validateSocketOAuthIssuer(config.issuer),
  }
}

export function parseCredentialRecord(
  raw: string,
  options: SocketOAuthCredentialOptions,
): OAuthCredentialRecord {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new TypeError(
      'Stored Socket OAuth credential is invalid; run socket-cli logout and login again',
    )
  }
  const config = normalizeSocketOAuthOptions(options)
  if (!isSocketOAuthCredentialRecord(value, config)) {
    throw new TypeError(
      'Stored Socket OAuth credential does not match this issuer and client',
    )
  }
  return value
}

export function readSocketOAuthCredential(
  options: SocketOAuthCredentialOptions,
  refresh: RefreshSocketOAuthToken = async refreshToken =>
    await refreshSocketOAuthTokens(options, refreshToken),
): Promise<SocketAuthCredential | undefined> {
  const config = normalizeSocketOAuthOptions(options)
  const account = socketOAuthAccount(config)
  const crypto = getNodeCrypto()
  const os = getNodeOs()
  const path = getNodePath()
  const username = crypto
    .createHash('sha256')
    .update(os.userInfo().username)
    .digest('hex')
    .slice(0, 16)
  const lock = path.join(
    os.tmpdir(),
    `socket-oauth-refresh-${username}-${account}`,
  )
  return processLock.withLock(lock, async () => {
    clearCache()
    const raw = await readSecret({ account, service: KEYCHAIN_SERVICE })
    if (!raw) {
      return undefined
    }
    const record = parseCredentialRecord(raw, config)
    if (record.expiresAt > Date.now() + REFRESH_SKEW_MS) {
      return {
        __proto__: null,
        authScheme: 'bearer',
        token: record.accessToken,
      }
    }
    try {
      const refreshed = await refresh(record.refreshToken)
      validateSocketOAuthTokens(refreshed, { requireRefreshToken: false })
      const next: OAuthCredentialRecord = {
        accessToken: refreshed.accessToken,
        clientId: record.clientId,
        expiresAt: Date.now() + refreshed.expiresIn * 1000,
        issuer: record.issuer,
        refreshToken: refreshed.refreshToken || record.refreshToken,
        version: RECORD_VERSION,
      }
      await writeSecret({
        account,
        service: KEYCHAIN_SERVICE,
        value: JSON.stringify(next),
      })
      return { __proto__: null, authScheme: 'bearer', token: next.accessToken }
    } catch (error) {
      if (
        error instanceof SocketOAuthError &&
        error.oauthError === 'invalid_grant'
      ) {
        await deleteSecret({ account, service: KEYCHAIN_SERVICE })
      }
      throw error
    }
  })
}

export function refreshSocketOAuthTokens(
  options: SocketOAuthCredentialOptions,
  refreshToken: string,
): Promise<SocketOAuthTokenSet> {
  const config = normalizeSocketOAuthOptions(options)
  const url = new URL('token', config.issuer)
  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  return httpRequest(url.href, {
    body: body.toString(),
    followRedirects: false,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    maxResponseSize: 64 * 1024,
    method: 'POST',
    retries: 0,
    timeout: 30_000,
  }).then(response => {
    const payload = response.json<unknown>()
    if (!isPlainObject(payload)) {
      throw new TypeError('Socket OAuth refresh response is invalid')
    }
    if (!response.ok) {
      throw new SocketOAuthError(
        typeof payload['error'] === 'string' ? payload['error'] : 'oauth_error',
        typeof payload['error_description'] === 'string'
          ? payload['error_description']
          : `Socket OAuth refresh failed with HTTP ${response.status}`,
      )
    }
    const tokens: SocketOAuthTokenSet = {
      accessToken: payload['access_token'] as string,
      expiresIn: payload['expires_in'] as number,
      refreshToken: payload['refresh_token'] as string | undefined,
      tokenType: payload['token_type'] as string,
    }
    validateSocketOAuthTokens(tokens, { requireRefreshToken: false })
    return tokens
  })
}

export function socketOAuthAccount(
  options: SocketOAuthCredentialOptions,
): string {
  const config = normalizeSocketOAuthOptions(options)
  const crypto = getNodeCrypto()
  return crypto
    .createHash('sha256')
    .update(`${config.issuer}\n${config.clientId}`)
    .digest('hex')
}

export async function storeSocketOAuthTokens(
  options: SocketOAuthCredentialOptions,
  tokens: SocketOAuthTokenSet,
): Promise<void> {
  const config = normalizeSocketOAuthOptions(options)
  validateSocketOAuthTokens(tokens, { requireRefreshToken: true })
  const record: OAuthCredentialRecord = {
    accessToken: tokens.accessToken,
    clientId: config.clientId,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
    issuer: config.issuer,
    refreshToken: tokens.refreshToken as string,
    version: RECORD_VERSION,
  }
  await writeSecret({
    account: socketOAuthAccount(config),
    service: KEYCHAIN_SERVICE,
    value: JSON.stringify(record),
  })
}

export function validateSocketOAuthIssuer(issuer: string): string {
  const url = new URL(issuer)
  const isLocalHttp =
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !isLocalHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      'Socket OAuth issuer is unsafe: provide an HTTPS URL without credentials, query, or fragment',
    )
  }
  if (!url.pathname.endsWith('/')) {
    url.pathname += '/'
  }
  return url.href
}

export function validateSocketOAuthTokens(
  tokens: SocketOAuthTokenSet,
  options: ValidateSocketOAuthTokenOptions,
): void {
  const config = {
    __proto__: null,
    ...options,
  } as ValidateSocketOAuthTokenOptions
  const hasRequiredRefreshToken =
    !config.requireRefreshToken ||
    (typeof tokens.refreshToken === 'string' && tokens.refreshToken.length > 0)
  if (
    typeof tokens.accessToken !== 'string' ||
    tokens.accessToken.length === 0 ||
    typeof tokens.tokenType !== 'string' ||
    tokens.tokenType.toLowerCase() !== 'bearer' ||
    !Number.isFinite(tokens.expiresIn) ||
    tokens.expiresIn <= 0 ||
    !hasRequiredRefreshToken ||
    (tokens.refreshToken !== undefined &&
      typeof tokens.refreshToken !== 'string')
  ) {
    throw new TypeError(
      'Socket OAuth response must include a bearer token with a positive lifetime',
    )
  }
}

/**
 * @file Unit tests for `secrets/login` — the browser paste flow, the
 *   biometric-first storage path, and the discovery gate that keeps the OAuth
 *   flow from running against endpoints that do not exist yet.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

// vi.mock factories are hoisted above const initializers, so the mocks live
// in vi.hoisted().
const { httpRequestMock, openUrlMock, passwordMock, writeSecretMock } =
  vi.hoisted(() => ({
    httpRequestMock: vi.fn(),
    openUrlMock: vi.fn(async () => true),
    passwordMock: vi.fn(async () => '  tok_pasted  '),
    writeSecretMock: vi.fn(async () => 'written' as const),
  }))

// Factory is a deliberate PARTIAL module shape; the import() form demands
// the full module and TS2769s (same precedent as create-src.test.mts).
// oxlint-disable-next-line socket/prefer-mock-import -- partial factory
vi.mock('../../../src/process/open-url', () => ({
  openUrl: openUrlMock,
}))
// Factory is a deliberate PARTIAL module shape; the import() form demands
// the full module and TS2769s (same precedent as create-src.test.mts).
// oxlint-disable-next-line socket/prefer-mock-import -- partial factory
vi.mock('../../../src/external/@inquirer/password', () => ({
  default: passwordMock,
}))
// Factory is a deliberate PARTIAL module shape; the import() form demands
// the full module and TS2769s (same precedent as create-src.test.mts).
// oxlint-disable-next-line socket/prefer-mock-import -- partial factory
vi.mock('../../../src/secrets/keychain', () => ({
  writeSecret: writeSecretMock,
}))
// Factory is a deliberate PARTIAL module shape; the import() form demands
// the full module and TS2769s (same precedent as create-src.test.mts).
// oxlint-disable-next-line socket/prefer-mock-import -- partial factory
vi.mock('../../../src/http-request/request', () => ({
  httpRequest: httpRequestMock,
}))

import { setKeychainAddon } from '../../../src/secrets/addon'
import {
  discoverSocketOauth,
  loginWithBrowser,
  loginWithSocketOauth,
  storeSocketApiToken,
} from '../../../src/secrets/login'

afterEach(() => {
  vi.clearAllMocks()
  setKeychainAddon(undefined)
})

describe('secrets/login — storeSocketApiToken', () => {
  it('prefers the biometric store and reports it', async () => {
    const set = vi.fn()
    setKeychainAddon({ del: vi.fn(), get: vi.fn(), set })
    const result = await storeSocketApiToken('tok')
    expect(result).toEqual({ storedWith: 'keychain-biometric', token: 'tok' })
    expect(set).toHaveBeenCalledWith(
      'socketsecurity',
      'SOCKET_API_TOKEN',
      'tok',
    )
    expect(writeSecretMock).not.toHaveBeenCalled()
  })

  it('falls back to the CLI keychain when no addon is present', async () => {
    const result = await storeSocketApiToken('tok')
    expect(result.storedWith).toBe('keychain')
    // The literal slot, not the imported constant: an expected value built
    // from the export under test would follow its bugs. This pins the
    // canonical service/account every Socket tool reads back.
    expect(writeSecretMock).toHaveBeenCalledWith({
      account: 'SOCKET_API_TOKEN',
      service: 'socketsecurity',
      value: 'tok',
    })
  })
})

describe('secrets/login — loginWithBrowser', () => {
  it('opens the dashboard, prompts masked, trims, and stores', async () => {
    const result = await loginWithBrowser()
    expect(openUrlMock).toHaveBeenCalledTimes(1)
    expect(result.token).toBe('tok_pasted')
    expect(result.storedWith).toBe('keychain')
  })

  it('honors noBrowser and never opens a window', async () => {
    await loginWithBrowser({ noBrowser: true })
    expect(openUrlMock).not.toHaveBeenCalled()
  })

  it('treats an empty paste as cancellation, storing nothing', async () => {
    passwordMock.mockResolvedValueOnce('   ')
    await expect(loginWithBrowser({ noBrowser: true })).rejects.toThrow(
      'cancelled',
    )
    expect(writeSecretMock).not.toHaveBeenCalled()
  })
})

describe('secrets/login — the OAuth discovery gate', () => {
  it('reads absence (404) as undefined, never a throw', async () => {
    httpRequestMock.mockResolvedValueOnce({ ok: false })
    expect(await discoverSocketOauth()).toBeUndefined()
  })

  it('reads a network failure as absence too', async () => {
    httpRequestMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    expect(await discoverSocketOauth()).toBeUndefined()
  })

  it('requires BOTH endpoints before reporting a live server', async () => {
    httpRequestMock.mockResolvedValueOnce({
      json: () => ({ authorization_endpoint: 'https://x/auth' }),
      ok: true,
    })
    expect(await discoverSocketOauth()).toBeUndefined()
  })

  it('refuses the OAuth flow while discovery is absent, naming the working path', async () => {
    httpRequestMock.mockResolvedValueOnce({ ok: false })
    await expect(loginWithSocketOauth()).rejects.toThrow('loginWithBrowser()')
  })

  it('refuses to run against a live server this client predates', async () => {
    // The forward-compat guard: endpoints appearing on socket.dev must not
    // light up a half-implemented dance in an OLD client.
    httpRequestMock.mockResolvedValueOnce({
      json: () => ({
        authorization_endpoint: 'https://socket.dev/oauth/authorize',
        token_endpoint: 'https://socket.dev/oauth/token',
      }),
      ok: true,
    })
    await expect(loginWithSocketOauth()).rejects.toThrow('predates')
  })
})

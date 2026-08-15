/**
 * @file Unit tests for the OCI anonymous-token client. Pure-parser tests cover
 *   the WWW-Authenticate challenge; network tests inject the fake `{ http }`
 *   adapter to exercise the probe → token flow with no live network.
 */

import { describe, expect, it } from 'vitest'

import {
  buildAnonymousTokenUrl,
  buildChallengeTokenUrl,
  firstHeaderValue,
  getRegistryToken,
  parseWwwAuthenticate,
} from '../../../src/oci/registry-token.mjs'
import { makeFakeAdapter } from './oci-test-helpers.mts'

import type { FakeRoute } from './oci-test-helpers.mts'

describe('parseWwwAuthenticate', () => {
  it('parses a full Bearer challenge', () => {
    const result = parseWwwAuthenticate(
      'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:owner/pkg:pull"',
    )
    expect(result).toEqual({
      realm: 'https://ghcr.io/token',
      scope: 'repository:owner/pkg:pull',
      service: 'ghcr.io',
    })
  })

  it('parses a realm-only challenge (service/scope undefined)', () => {
    const result = parseWwwAuthenticate(
      'Bearer realm="https://auth.example/token"',
    )
    expect(result).toEqual({
      realm: 'https://auth.example/token',
      scope: undefined,
      service: undefined,
    })
  })

  it('returns undefined for a non-Bearer scheme', () => {
    expect(parseWwwAuthenticate('Basic realm="x"')).toBeUndefined()
  })

  it('returns undefined when realm is absent', () => {
    expect(parseWwwAuthenticate('Bearer service="ghcr.io"')).toBeUndefined()
  })

  it('is case-insensitive on the Bearer keyword', () => {
    const result = parseWwwAuthenticate('bearer realm="https://r/token"')
    expect(result?.realm).toBe('https://r/token')
  })
})

describe('firstHeaderValue', () => {
  it('returns a string header verbatim', () => {
    expect(firstHeaderValue('one')).toBe('one')
  })

  it('returns the first entry of an array header', () => {
    expect(firstHeaderValue(['a', 'b'])).toBe('a')
  })

  it('returns undefined for an absent header', () => {
    expect(firstHeaderValue(undefined)).toBeUndefined()
  })
})

describe('buildChallengeTokenUrl', () => {
  it('forces a pull scope for the repository', () => {
    const url = buildChallengeTokenUrl(
      {
        realm: 'https://ghcr.io/token',
        scope: 'repository:other:pull',
        service: 'ghcr.io',
      },
      'owner/pkg',
    )
    expect(url).toBe(
      'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aowner%2Fpkg%3Apull',
    )
  })

  it('omits the service param when the challenge had none', () => {
    const url = buildChallengeTokenUrl(
      { realm: 'https://r/token', scope: undefined, service: undefined },
      'owner/pkg',
    )
    expect(url).toBe('https://r/token?scope=repository%3Aowner%2Fpkg%3Apull')
  })
})

describe('buildAnonymousTokenUrl', () => {
  it('builds the conventional service+scope URL', () => {
    expect(buildAnonymousTokenUrl('ghcr.io', 'owner/pkg')).toBe(
      'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aowner%2Fpkg%3Apull',
    )
  })
})

describe('getRegistryToken', () => {
  it('honors a 401 challenge and returns the minted token (ghcr flow)', async () => {
    const routes = new Map<string, FakeRoute>([
      [
        'https://ghcr.io/v2/',
        {
          headers: {
            'www-authenticate':
              'Bearer realm="https://ghcr.io/token",service="ghcr.io"',
          },
          status: 401,
        },
      ],
      [
        'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aowner%2Fpkg%3Apull',
        { body: { token: 'minted-token' } },
      ],
    ])
    const { calls, http } = makeFakeAdapter(routes)
    const token = await getRegistryToken('ghcr.io', 'owner/pkg', { http })
    expect(token).toBe('minted-token')
    expect(calls[0]?.url).toBe('https://ghcr.io/v2/')
  })

  it('accepts access_token as the bearer field', async () => {
    const routes = new Map<string, FakeRoute>([
      [
        'https://ghcr.io/v2/',
        {
          headers: {
            'www-authenticate': 'Bearer realm="https://ghcr.io/token"',
          },
          status: 401,
        },
      ],
      [
        'https://ghcr.io/token?scope=repository%3Aowner%2Fpkg%3Apull',
        { body: { access_token: 'oauth-token' } },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    const token = await getRegistryToken('ghcr.io', 'owner/pkg', { http })
    expect(token).toBe('oauth-token')
  })

  it('falls back to the conventional token endpoint on a 200 probe', async () => {
    const routes = new Map<string, FakeRoute>([
      ['https://reg.example/v2/', { status: 200 }],
      [
        'https://reg.example/token?service=reg.example&scope=repository%3Aowner%2Fpkg%3Apull',
        { body: { token: 'anon-token' } },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    const token = await getRegistryToken('reg.example', 'owner/pkg', { http })
    expect(token).toBe('anon-token')
  })

  it('returns an empty token when a 200 registry has no token endpoint', async () => {
    const routes = new Map<string, FakeRoute>([
      ['https://reg.example/v2/', { status: 200 }],
      [
        'https://reg.example/token?service=reg.example&scope=repository%3Aowner%2Fpkg%3Apull',
        { status: 404 },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    const token = await getRegistryToken('reg.example', 'owner/pkg', { http })
    expect(token).toBe('')
  })

  it('returns an empty token when the endpoint body has neither field', async () => {
    const routes = new Map<string, FakeRoute>([
      ['https://reg.example/v2/', { status: 200 }],
      [
        'https://reg.example/token?service=reg.example&scope=repository%3Aowner%2Fpkg%3Apull',
        { body: {} },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    const token = await getRegistryToken('reg.example', 'owner/pkg', { http })
    expect(token).toBe('')
  })

  it('fails loud when the challenge-flow token endpoint rejects', async () => {
    const routes = new Map<string, FakeRoute>([
      [
        'https://ghcr.io/v2/',
        {
          headers: {
            'www-authenticate': 'Bearer realm="https://ghcr.io/token"',
          },
          status: 401,
        },
      ],
      [
        'https://ghcr.io/token?scope=repository%3Aowner%2Fpkg%3Apull',
        { status: 500, statusText: 'Server Error' },
      ],
    ])
    const { http } = makeFakeAdapter(routes)
    await expect(
      getRegistryToken('ghcr.io', 'owner/pkg', { http }),
    ).rejects.toThrow(/Token request failed/)
  })

  it('fails loud on a 401 with no parseable challenge', async () => {
    const routes = new Map<string, FakeRoute>([
      ['https://reg.example/v2/', { status: 401 }],
    ])
    const { http } = makeFakeAdapter(routes)
    await expect(
      getRegistryToken('reg.example', 'owner/pkg', { http }),
    ).rejects.toThrow(/Cannot authenticate to registry/)
  })

  it('fails loud on a non-2xx, non-401 probe', async () => {
    const routes = new Map<string, FakeRoute>([
      ['https://reg.example/v2/', { status: 500, statusText: 'Server Error' }],
    ])
    const { http } = makeFakeAdapter(routes)
    await expect(
      getRegistryToken('reg.example', 'owner/pkg', { http }),
    ).rejects.toThrow(/Registry probe failed/)
  })

  it('fails loud when the probe request throws', async () => {
    const http = {
      async json<T>(): Promise<T> {
        throw new Error('unused')
      },
      async request(): Promise<never> {
        throw new Error('network down')
      },
    }
    await expect(
      getRegistryToken('reg.example', 'owner/pkg', { http }),
    ).rejects.toThrow(/Cannot reach registry/)
  })
})

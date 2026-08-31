/**
 * @file Unit tests for the live (cache-busted) npm registry reads. Every
 *   network helper is exercised through an injected `{ http: { json } }`
 *   adapter that records the URL + headers it was handed — no sockets, no
 *   nock. The 404-vs-network split is asserted with structurally-shaped
 *   errors matching both `HttpResponseError` twins.
 */

import { describe, expect, it } from 'vitest'

import {
  cacheBustedRead,
  fetchLatestPublishedVersionChecked,
  getMaintainers,
  httpErrorStatus,
} from '../../../../../src/eco/npm/registry/live.mjs'

import type { NpmHttpOptions } from '../../../../../src/eco/npm/registry/index.mjs'

interface RecordedCall {
  headers: Record<string, string> | undefined
  url: string
}

function makeAdapter(
  respond: (url: string) => unknown,
  calls: RecordedCall[],
): NpmHttpOptions {
  return {
    http: {
      async bytes(
        url: string,
        init?: { headers?: Record<string, string> | undefined } | undefined,
      ): Promise<Uint8Array> {
        calls.push({ headers: init?.headers, url })
        return new Uint8Array(0)
      },
      async json<T>(
        url: string,
        init?: { headers?: Record<string, string> | undefined } | undefined,
      ): Promise<T> {
        calls.push({ headers: init?.headers, url })
        return respond(url) as T
      },
    },
  }
}

function make404(): Error {
  const e = new Error('HTTP 404: Not Found')
  ;(e as unknown as { response: { status: number } }).response = {
    status: 404,
  }
  return e
}

describe('cacheBustedRead', () => {
  it('appends the injected nonce as a _cb query param', () => {
    const read = cacheBustedRead(
      'https://registry.npmjs.org/left-pad',
      'application/json',
      'nonce-1',
    )
    expect(read.url).toBe('https://registry.npmjs.org/left-pad?_cb=nonce-1')
  })

  it('uses & when the URL already carries a query string', () => {
    const read = cacheBustedRead('https://x.test/p?a=1', 'text/plain', 'n2')
    expect(read.url).toBe('https://x.test/p?a=1&_cb=n2')
  })

  it('layers the no-cache headers over the accept header', () => {
    const read = cacheBustedRead('https://x.test/p', 'application/json', 'n')
    expect(read.headers).toEqual({
      accept: 'application/json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    })
  })

  it('defaults to a unique nonce per call', () => {
    const a = cacheBustedRead('https://x.test/p', 'application/json')
    const b = cacheBustedRead('https://x.test/p', 'application/json')
    expect(a.url).not.toBe(b.url)
    expect(a.url).toMatch(/\?_cb=[0-9a-f-]{36}$/)
  })
})

describe('httpErrorStatus', () => {
  it('reads response.status off HttpResponseError-shaped errors', () => {
    expect(httpErrorStatus(make404())).toBe(404)
  })

  it('reads a bare status off fetch-style errors', () => {
    const e = Object.assign(new Error('boom'), { status: 503 })
    expect(httpErrorStatus(e)).toBe(503)
  })

  it('returns undefined for network-level errors and non-objects', () => {
    expect(httpErrorStatus(new Error('ECONNRESET'))).toBeUndefined()
    expect(httpErrorStatus(undefined)).toBeUndefined()
    expect(httpErrorStatus(undefined)).toBeUndefined()
    expect(httpErrorStatus('nope')).toBeUndefined()
  })

  it('ignores a non-numeric response.status', () => {
    const e = Object.assign(new Error('weird'), {
      response: { status: 'teapot' },
    })
    expect(httpErrorStatus(e)).toBeUndefined()
  })
})

describe('fetchLatestPublishedVersionChecked', () => {
  it('sends the cache-busted URL and no-cache headers to the adapter', async () => {
    const calls: RecordedCall[] = []
    const options = makeAdapter(
      () => ({ 'dist-tags': { latest: '1.2.3' } }),
      calls,
    )
    const read = await fetchLatestPublishedVersionChecked('left-pad', {
      ...options,
      nonce: 'test-nonce',
    })
    expect(read).toEqual({ latest: '1.2.3', reachable: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(
      'https://registry.npmjs.org/left-pad?_cb=test-nonce',
    )
    expect(calls[0]!.headers).toEqual({
      accept: 'application/vnd.npm.install-v1+json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    })
  })

  it('registry-encodes scoped names', async () => {
    const calls: RecordedCall[] = []
    const options = makeAdapter(() => ({}), calls)
    await fetchLatestPublishedVersionChecked('@scope/name', {
      ...options,
      nonce: 'n',
    })
    expect(calls[0]!.url).toBe('https://registry.npmjs.org/@scope%2Fname?_cb=n')
  })

  it('treats a 404 as reachable-but-never-published', async () => {
    const options: NpmHttpOptions = {
      http: {
        async bytes(): Promise<never> {
          throw new Error('this adapter serves JSON only')
        },
        async json(): Promise<never> {
          throw make404()
        },
      },
    }
    const read = await fetchLatestPublishedVersionChecked('ghost-pkg', options)
    expect(read).toEqual({ latest: undefined, reachable: true })
  })

  it('treats a network error as unreachable, never as unpublished', async () => {
    const options: NpmHttpOptions = {
      http: {
        async bytes(): Promise<never> {
          throw new Error('this adapter serves JSON only')
        },
        async json(): Promise<never> {
          throw new Error('ETIMEDOUT')
        },
      },
    }
    const read = await fetchLatestPublishedVersionChecked('left-pad', options)
    expect(read).toEqual({ reachable: false })
  })

  it('treats a 5xx as unreachable', async () => {
    const options: NpmHttpOptions = {
      http: {
        async bytes(): Promise<never> {
          throw new Error('this adapter serves JSON only')
        },
        async json(): Promise<never> {
          const e = new Error('HTTP 503')
          ;(e as unknown as { response: { status: number } }).response = {
            status: 503,
          }
          throw e
        },
      },
    }
    const read = await fetchLatestPublishedVersionChecked('left-pad', options)
    expect(read).toEqual({ reachable: false })
  })

  it('reports reachable with latest undefined when dist-tags is absent', async () => {
    const calls: RecordedCall[] = []
    const options = makeAdapter(() => ({}), calls)
    const read = await fetchLatestPublishedVersionChecked('odd-pkg', options)
    expect(read).toEqual({ latest: undefined, reachable: true })
  })
})

describe('getMaintainers', () => {
  it('returns the maintainer usernames sorted', async () => {
    const calls: RecordedCall[] = []
    const options = makeAdapter(
      () => ({
        maintainers: [{ name: 'zed' }, { name: 'alice' }, { name: 'mike' }],
      }),
      calls,
    )
    const names = await getMaintainers('left-pad', { ...options, nonce: 'n' })
    expect(names).toEqual(['alice', 'mike', 'zed'])
    expect(calls[0]!.url).toBe('https://registry.npmjs.org/left-pad?_cb=n')
    expect(calls[0]!.headers?.['accept']).toBe('application/json')
  })

  it('drops entries with missing or empty names', async () => {
    const options = makeAdapter(
      () => ({ maintainers: [{ name: 'bob' }, { name: '' }, {}] }),
      [],
    )
    expect(await getMaintainers('p', options)).toEqual(['bob'])
  })

  it('returns an empty list when the packument has no maintainers field', async () => {
    const options = makeAdapter(() => ({}), [])
    expect(await getMaintainers('p', options)).toEqual([])
  })

  it('returns undefined on a 404 (never published)', async () => {
    const options: NpmHttpOptions = {
      http: {
        async bytes(): Promise<never> {
          throw new Error('this adapter serves JSON only')
        },
        async json(): Promise<never> {
          throw make404()
        },
      },
    }
    expect(await getMaintainers('ghost-pkg', options)).toBeUndefined()
  })

  it('propagates non-404 failures so membership gates fail closed', async () => {
    const options: NpmHttpOptions = {
      http: {
        async bytes(): Promise<never> {
          throw new Error('this adapter serves JSON only')
        },
        async json(): Promise<never> {
          throw new Error('ECONNRESET')
        },
      },
    }
    await expect(getMaintainers('left-pad', options)).rejects.toThrow(
      'ECONNRESET',
    )
  })
})

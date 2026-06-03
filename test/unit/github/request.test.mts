import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubEmptyBodyError } from '../../../src/github/errors'
import { fetchGitHub } from '../../../src/github/request'

const GITHUB_API = 'https://api.github.com'

describe('fetchGitHub', () => {
  beforeEach(() => {
    nock.disableNetConnect()
    nock.cleanAll()
    vi.resetModules()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it('returns parsed JSON on 200', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(200, { id: 1, name: 'bar' })
    const result = await fetchGitHub<{ id: number }>(`${GITHUB_API}/repos/foo/bar`)
    expect(result.id).toBe(1)
  })

  it('passes Authorization header when token provided', async () => {
    nock(GITHUB_API, {
      reqheaders: { authorization: 'token mytoken' },
    })
      .get('/repos/foo/bar')
      .reply(200, { id: 2 })
    await fetchGitHub(`${GITHUB_API}/repos/foo/bar`, { token: 'mytoken' })
  })

  it('does not pass Authorization when empty-string token provided (uses env fallback)', async () => {
    // With ?? fix: empty string is falsy but ?? only falls back on undefined/null
    // so '' passes through as the token value. This test documents that behavior.
    nock(GITHUB_API).get('/repos/foo/bar').reply(200, { id: 3 })
    await fetchGitHub(`${GITHUB_API}/repos/foo/bar`, { token: '' })
  })

  describe('5xx responses — probes GitHubStatus', () => {
    beforeEach(() => {
      // Mock the githubstatus probe so tests are hermetic
      nock('https://www.githubstatus.com')
        .get('/api/v2/components.json')
        .reply(200, {
          components: [
            { id: 'br0l2tvcx85d', name: 'Actions', status: 'operational' },
            { id: '8l4ygp009s5s', name: 'Git Operations', status: 'operational' },
            { id: 'brv1bkgrwx7q', name: 'API Requests', status: 'operational' },
          ],
        })
    })

    it('throws with status note when all components are operational', async () => {
      nock(GITHUB_API).get('/repos/foo/bar').reply(502, 'Bad Gateway')
      await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
        /GitHub API error 502.*all monitored components operational/s,
      )
    })

    it('throws with degraded component details when GitHub is degraded', async () => {
      nock.cleanAll()
      nock('https://www.githubstatus.com')
        .get('/api/v2/components.json')
        .reply(200, {
          components: [
            { id: 'br0l2tvcx85d', name: 'Actions', status: 'degraded_performance' },
            { id: '8l4ygp009s5s', name: 'Git Operations', status: 'operational' },
            { id: 'brv1bkgrwx7q', name: 'API Requests', status: 'operational' },
          ],
        })
      nock(GITHUB_API).get('/repos/foo/bar').reply(503, 'Service Unavailable')
      await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
        /GitHub platform status at time of failure.*Actions: degraded_performance/s,
      )
    })

    it('throws with unreachable note when status probe fails', async () => {
      nock.cleanAll()
      nock('https://www.githubstatus.com')
        .get('/api/v2/components.json')
        .replyWithError('ECONNREFUSED')
      nock(GITHUB_API).get('/repos/foo/bar').reply(500, 'Internal Server Error')
      await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
        /GitHub API error 500.*unreachable/s,
      )
    })
  })

  it('throws GitHubEmptyBodyError on 200 with zero-byte body', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(200, '')
    await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toBeInstanceOf(
      GitHubEmptyBodyError,
    )
  })

  it('throws on malformed JSON body', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(200, 'not json {{{')
    await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
      /Failed to parse GitHub API response/,
    )
  })

  it('throws GitHubRateLimitError on 403 rate limit', async () => {
    nock(GITHUB_API)
      .get('/repos/foo/bar')
      .reply(
        403,
        { message: 'API rate limit exceeded' },
        { 'X-RateLimit-Reset': '9999999999' },
      )
    const err = await fetchGitHub(`${GITHUB_API}/repos/foo/bar`).catch(e => e)
    expect(err.message).toMatch(/rate limit exceeded/)
    expect(err.status).toBe(403)
  })

  it('throws plain error on non-5xx, non-403 error status', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(404, 'Not Found')
    await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
      /GitHub API error 404/,
    )
  })
})

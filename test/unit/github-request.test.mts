/**
 * @file Unit tests for the network-facing GitHub fetch + ref-resolution
 *   helpers:
 *
 *   - fetchGitHub() raw GitHub API requests (auth, rate limits, error codes)
 *   - resolveRefToSha() git reference resolution (tag → branch → commit, with
 *     GraphQL fallback for the empty-body incident shape) These tests mock HTTP
 *     with nock. GHSA advisory fetches live in github-ghsa.test.mts; token/URL
 *     helpers live in github.test.mts and github-ghsa-url.test.mts.
 */

import { fetchGitHub } from '../../src/github/request'
import { clearRefCache, resolveRefToSha } from '../../src/github/refs'
import { resetEnv, setEnv } from '../../src/env/rewire'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import nock from 'nock'

describe.sequential('github fetch and refs', () => {
  beforeEach(() => {
    // Clear environment variables
    resetEnv()
    clearRefCache()
  })

  afterEach(() => {
    resetEnv()
  })

  describe('fetchGitHub', () => {
    afterEach(() => {
      nock.cleanAll()
    })

    it('should fetch from GitHub API successfully', async () => {
      const mockData = { name: 'test-repo', full_name: 'owner/test-repo' }
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, mockData)

      const result = await fetchGitHub(
        'https://api.github.com/repos/owner/repo',
      )
      expect(result).toEqual(mockData)
    })

    it('should include authorization header when token provided', async () => {
      nock('https://api.github.com')
        .get('/user')
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, { login: 'testuser' })

      const result = await fetchGitHub('https://api.github.com/user', {
        token: 'test-token',
      })
      expect(result).toHaveProperty('login')
    })

    it('should handle rate limit errors with reset time', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(403, 'rate limit exceeded', {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow('GitHub API rate limit exceeded')
    })

    it('should handle rate limit errors without reset time', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(403, 'rate limit exceeded', {
          'x-ratelimit-remaining': '0',
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow('GitHub API rate limit exceeded')
    })

    it('should handle non-rate-limit 403 errors', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/private')
        .reply(403, 'Forbidden', {
          'x-ratelimit-remaining': '50',
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/private'),
      ).rejects.toThrow('GitHub API error 403')
    })

    it('should handle 404 errors', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/nonexistent')
        .reply(404, 'Not Found')

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/nonexistent'),
      ).rejects.toThrow('GitHub API error 404')
    })

    it('should include custom headers', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .matchHeader('X-Custom-Header', 'custom-value')
        .reply(200, {})

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo', {
          headers: { 'X-Custom-Header': 'custom-value' },
        }),
      ).resolves.toEqual({})
    })

    it('should throw GitHubEmptyBodyError on 200 + zero-byte body', async () => {
      // The documented GitHub-search-degraded incident shape: REST
      // returns HTTP 200 OK with a body of 0 bytes (no error code,
      // no Retry-After, no rate-limit signal). Without a typed
      // error, callers parse '' and throw a confusing SyntaxError;
      // the typed error gives downstream callers a single
      // `instanceof` check to switch on for fallback transports.
      nock('https://api.github.com').get('/repos/owner/repo').reply(200, '')

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow(/empty body/)
    })
  })

  describe('resolveRefToSha', () => {
    beforeEach(() => {
      setEnv('DISABLE_GITHUB_CACHE', '1')
    })

    afterEach(() => {
      nock.cleanAll()
    })

    it('should resolve tag to SHA', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/v1.0.0')
        .reply(200, {
          ref: 'refs/tags/v1.0.0',
          object: {
            sha: 'abc123',
            type: 'commit',
            url: 'https://api.github.com/repos/owner/repo/git/commits/abc123',
          },
        })

      const sha = await resolveRefToSha('owner', 'repo', 'v1.0.0')
      expect(sha).toBe('abc123')
    })

    it('should resolve annotated tag to commit SHA', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/v2.0.0')
        .reply(200, {
          ref: 'refs/tags/v2.0.0',
          object: {
            sha: 'tag456',
            type: 'tag',
            url: 'https://api.github.com/repos/owner/repo/git/tags/tag456',
          },
        })
        .get('/repos/owner/repo/git/tags/tag456')
        .reply(200, {
          tag: 'v2.0.0',
          sha: 'tag456',
          object: {
            sha: 'commit789',
            type: 'commit',
          },
        })

      const sha = await resolveRefToSha('owner', 'repo', 'v2.0.0')
      expect(sha).toBe('commit789')
    })

    it('should resolve branch to SHA', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/main')
        .reply(404)
        .get('/repos/owner/repo/git/refs/heads/main')
        .reply(200, {
          ref: 'refs/heads/main',
          object: {
            sha: 'branch123',
            type: 'commit',
          },
        })

      const sha = await resolveRefToSha('owner', 'repo', 'main')
      expect(sha).toBe('branch123')
    })

    it('should resolve commit SHA directly', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/abc123def456')
        .reply(404)
        .get('/repos/owner/repo/git/refs/heads/abc123def456')
        .reply(404)
        .get('/repos/owner/repo/commits/abc123def456')
        .reply(200, {
          sha: 'abc123def456789012345678901234567890abcd',
          commit: {},
        })

      const sha = await resolveRefToSha('owner', 'repo', 'abc123def456')
      expect(sha).toBe('abc123def456789012345678901234567890abcd')
    })

    it('should throw error when ref cannot be resolved', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/nonexistent')
        .reply(404)
        .get('/repos/owner/repo/git/refs/heads/nonexistent')
        .reply(404)
        .get('/repos/owner/repo/commits/nonexistent')
        .reply(404)

      await expect(
        resolveRefToSha('owner', 'repo', 'nonexistent'),
      ).rejects.toThrow('Failed to resolve ref')
    })

    it('should fall back to GraphQL when REST returns 200 + empty body', async () => {
      // GitHub Elasticsearch incident shape — REST endpoints across
      // the API surface return HTTP 200 with zero-byte bodies. The
      // tier cascade (tag → branch → commit) detects this via the
      // typed `GitHubEmptyBodyError` and routes the lookup through
      // GraphQL `repository.ref(qualifiedName)` which uses a
      // different backend. Uses a unique ref name to avoid colliding
      // with the resolveRefToSha cache populated by prior tests
      // (clearRefCache is not awaited in the outer beforeEach).
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/incident-tag-via-graphql')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/incident-tag-via-graphql')
        .reply(200, '')
        .get('/repos/owner/repo/commits/incident-tag-via-graphql')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              tagRef: {
                target: {
                  __typename: 'Commit',
                  oid: 'graphql-commit-sha-aaa',
                },
              },
              branchRef: undefined,
              commit: undefined,
            },
          },
        })

      const sha = await resolveRefToSha(
        'owner',
        'repo',
        'incident-tag-via-graphql',
      )
      expect(sha).toBe('graphql-commit-sha-aaa')
    })

    it('should resolve annotated tags via GraphQL fallback', async () => {
      // Annotated tags wrap a Commit inside a Tag; in REST this needs
      // a second lookup against `tagData.object.url`. GraphQL returns
      // both in a single query — `Tag.target.oid` is the commit SHA.
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/incident-annotated-tag')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/incident-annotated-tag')
        .reply(200, '')
        .get('/repos/owner/repo/commits/incident-annotated-tag')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              tagRef: {
                target: {
                  __typename: 'Tag',
                  target: { oid: 'annotated-commit-sha-bbb' },
                },
              },
              branchRef: undefined,
              commit: undefined,
            },
          },
        })

      const sha = await resolveRefToSha(
        'owner',
        'repo',
        'incident-annotated-tag',
      )
      expect(sha).toBe('annotated-commit-sha-bbb')
    })

    it('should resolve branches via GraphQL fallback when REST is empty', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/incident-branch-via-graphql')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/incident-branch-via-graphql')
        .reply(200, '')
        .get('/repos/owner/repo/commits/incident-branch-via-graphql')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              tagRef: undefined,
              branchRef: { target: { oid: 'branch-head-sha-ccc' } },
              commit: undefined,
            },
          },
        })

      const sha = await resolveRefToSha(
        'owner',
        'repo',
        'incident-branch-via-graphql',
      )
      expect(sha).toBe('branch-head-sha-ccc')
    })

    it('should NOT fall back to GraphQL when REST cascade hits genuine 404s', async () => {
      // Real 404s (the ref genuinely doesn't exist as a tag, branch,
      // or commit) must NOT trigger the GraphQL fallback. The
      // fallback is reserved for the documented incident shape
      // (200 + empty body); a 404-throughout cascade should produce
      // the standard "ref not found" error without any GraphQL
      // round trip. We use nock with no `.post('/graphql')` mock —
      // if the code DID call GraphQL, nock would fail loudly with
      // "no match for request".
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/genuinely-missing-ref')
        .reply(404)
        .get('/repos/owner/repo/git/refs/heads/genuinely-missing-ref')
        .reply(404)
        .get('/repos/owner/repo/commits/genuinely-missing-ref')
        .reply(404)

      await expect(
        resolveRefToSha('owner', 'repo', 'genuinely-missing-ref'),
      ).rejects.toThrow('Failed to resolve ref')
    })

    it('should re-throw original REST error when GraphQL fallback also fails', async () => {
      // Both transports degraded: REST hits empty bodies all the way
      // through the cascade, GraphQL returns a non-OK status. The
      // helper should swallow the GraphQL transport error and
      // surface the REST cascade's 'Failed to resolve ref' message
      // — that's more actionable for the user than a confusing
      // GraphQL-side error caused by the same incident.
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/double-failure-ref')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/double-failure-ref')
        .reply(200, '')
        .get('/repos/owner/repo/commits/double-failure-ref')
        .reply(200, '')
        .post('/graphql')
        .reply(503, 'graphql unavailable')

      await expect(
        resolveRefToSha('owner', 'repo', 'double-failure-ref'),
      ).rejects.toThrow('Failed to resolve ref')
    })

    it('should return undefined from GraphQL when ref not found anywhere', async () => {
      // GraphQL ran successfully but all three aliases (tagRef,
      // branchRef, commit) came back null — the ref legitimately
      // doesn't exist. Caller falls back to the REST error message.
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/incident-but-real-404')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/incident-but-real-404')
        .reply(200, '')
        .get('/repos/owner/repo/commits/incident-but-real-404')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              tagRef: undefined,
              branchRef: undefined,
              commit: undefined,
            },
          },
        })

      await expect(
        resolveRefToSha('owner', 'repo', 'incident-but-real-404'),
      ).rejects.toThrow('Failed to resolve ref')
    })

    it('should forward auth token to GraphQL fallback', async () => {
      // The user-provided token must be threaded through to the
      // GraphQL POST as a Bearer auth header — GraphQL queries to
      // private repos require auth even when REST anonymous works.
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/auth-forwarding-ref')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/auth-forwarding-ref')
        .reply(200, '')
        .get('/repos/owner/repo/commits/auth-forwarding-ref')
        .reply(200, '')
        .post('/graphql')
        .matchHeader('Authorization', 'Bearer custom-token-xyz')
        .reply(200, {
          data: {
            repository: {
              tagRef: {
                target: { __typename: 'Commit', oid: 'auth-sha-ddd' },
              },
              branchRef: undefined,
              commit: undefined,
            },
          },
        })

      const sha = await resolveRefToSha(
        'owner',
        'repo',
        'auth-forwarding-ref',
        { token: 'custom-token-xyz' },
      )
      expect(sha).toBe('auth-sha-ddd')
    })
  })
})

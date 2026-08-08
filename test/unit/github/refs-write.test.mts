/**
 * @file Unit tests for the GitHub git-refs write helpers. The transport is
 *   mocked with nock at the node:http seam, the same way the refs read /
 *   request tests mock GitHub — request bodies, methods, and auth headers are
 *   asserted on the intercepted calls; nothing reaches the network.
 */

import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createBranchRef,
  createTagRef,
  deleteBranchRef,
  refWriteHeaders,
  updateBranchRef,
} from '../../../src/github/refs-write'

const GITHUB_API = 'https://api.github.com'
const SHA = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3'

describe('github/refs-write', () => {
  beforeEach(() => {
    nock.disableNetConnect()
    nock.cleanAll()
    // Keep getGitHubToken()'s env fallback deterministic.
    vi.stubEnv('GITHUB_TOKEN', '')
    vi.stubEnv('GH_TOKEN', '')
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
    vi.unstubAllEnvs()
  })

  describe('refWriteHeaders', () => {
    it('carries the JSON accept/content-type and pinned API version', () => {
      const headers = refWriteHeaders('tok')
      expect(headers['accept']).toBe('application/vnd.github+json')
      expect(headers['content-type']).toBe('application/json')
      expect(headers['x-github-api-version']).toBe('2022-11-28')
      expect(headers['authorization']).toBe('Bearer tok')
    })

    it('omits authorization when no token resolves', () => {
      expect(refWriteHeaders()['authorization']).toBeUndefined()
    })

    it('falls back to the env token when none is passed', () => {
      vi.stubEnv('GITHUB_TOKEN', 'env-token')
      expect(refWriteHeaders()['authorization']).toBe('Bearer env-token')
    })
  })

  describe('createBranchRef', () => {
    it('POSTs refs/heads/<branch> with the sha and Bearer auth', async () => {
      let body: unknown
      nock(GITHUB_API, {
        reqheaders: {
          authorization: 'Bearer tok',
          'x-github-api-version': '2022-11-28',
        },
      })
        .post('/repos/octo/lib/git/refs', (b: unknown) => {
          body = b
          return true
        })
        .reply(201, { ref: 'refs/heads/npm-publish-v1.4.3' })
      await createBranchRef({
        branch: 'npm-publish-v1.4.3',
        repo: 'octo/lib',
        sha: SHA,
        token: 'tok',
      })
      expect(body).toEqual({ ref: 'refs/heads/npm-publish-v1.4.3', sha: SHA })
    })

    it('throws HttpResponseError when the ref already exists (422)', async () => {
      nock(GITHUB_API)
        .post('/repos/octo/lib/git/refs')
        .reply(422, { message: 'Reference already exists' })
      await expect(
        createBranchRef({
          branch: 'dup',
          repo: 'octo/lib',
          sha: SHA,
          token: 'tok',
        }),
      ).rejects.toThrow('HTTP 422')
    })

    it('honors an apiUrl override', async () => {
      const scope = nock('https://ghe.example.test')
        .post('/repos/octo/lib/git/refs')
        .reply(201, {})
      await createBranchRef({
        apiUrl: 'https://ghe.example.test',
        branch: 'b',
        repo: 'octo/lib',
        sha: SHA,
        token: 'tok',
      })
      expect(scope.isDone()).toBe(true)
    })
  })

  describe('updateBranchRef', () => {
    it('PATCHes the branch ref with force false by default', async () => {
      let body: unknown
      nock(GITHUB_API)
        .patch('/repos/octo/lib/git/refs/heads/main', (b: unknown) => {
          body = b
          return true
        })
        .reply(200, {})
      await updateBranchRef({
        branch: 'main',
        repo: 'octo/lib',
        sha: SHA,
        token: 'tok',
      })
      expect(body).toEqual({ force: false, sha: SHA })
    })

    it('passes force true through when requested', async () => {
      let body: unknown
      nock(GITHUB_API)
        .patch('/repos/octo/lib/git/refs/heads/main', (b: unknown) => {
          body = b
          return true
        })
        .reply(200, {})
      await updateBranchRef({
        branch: 'main',
        force: true,
        repo: 'octo/lib',
        sha: SHA,
        token: 'tok',
      })
      expect(body).toEqual({ force: true, sha: SHA })
    })

    it('propagates the 422 a non-fast-forward advance earns', async () => {
      nock(GITHUB_API)
        .patch('/repos/octo/lib/git/refs/heads/main')
        .reply(422, { message: 'Update is not a fast forward' })
      await expect(
        updateBranchRef({
          branch: 'main',
          repo: 'octo/lib',
          sha: SHA,
          token: 'tok',
        }),
      ).rejects.toThrow('HTTP 422')
    })
  })

  describe('createTagRef', () => {
    it('POSTs refs/tags/<tag> with the sha', async () => {
      let body: unknown
      nock(GITHUB_API)
        .post('/repos/octo/lib/git/refs', (b: unknown) => {
          body = b
          return true
        })
        .reply(201, {})
      await createTagRef({
        repo: 'octo/lib',
        sha: SHA,
        tag: 'v1.4.3',
        token: 'tok',
      })
      expect(body).toEqual({ ref: 'refs/tags/v1.4.3', sha: SHA })
    })

    it('throws HttpResponseError when the tag already exists (422)', async () => {
      nock(GITHUB_API)
        .post('/repos/octo/lib/git/refs')
        .reply(422, { message: 'Reference already exists' })
      await expect(
        createTagRef({ repo: 'octo/lib', sha: SHA, tag: 'v1', token: 'tok' }),
      ).rejects.toThrow('HTTP 422')
    })
  })

  describe('deleteBranchRef', () => {
    it('DELETEs the branch ref and resolves on 204', async () => {
      const scope = nock(GITHUB_API, {
        reqheaders: { authorization: 'Bearer tok' },
      })
        .delete('/repos/octo/lib/git/refs/heads/stale')
        .reply(204)
      await deleteBranchRef({ branch: 'stale', repo: 'octo/lib', token: 'tok' })
      expect(scope.isDone()).toBe(true)
    })

    it('swallows a 404 — the ref is already gone', async () => {
      nock(GITHUB_API)
        .delete('/repos/octo/lib/git/refs/heads/gone')
        .reply(404, { message: 'Not Found' })
      await expect(
        deleteBranchRef({ branch: 'gone', repo: 'octo/lib', token: 'tok' }),
      ).resolves.toBeUndefined()
    })

    it('swallows a 422 the same way', async () => {
      nock(GITHUB_API)
        .delete('/repos/octo/lib/git/refs/heads/gone')
        .reply(422, { message: 'Reference does not exist' })
      await expect(
        deleteBranchRef({ branch: 'gone', repo: 'octo/lib', token: 'tok' }),
      ).resolves.toBeUndefined()
    })

    it('propagates auth failures (401)', async () => {
      nock(GITHUB_API)
        .delete('/repos/octo/lib/git/refs/heads/b')
        .reply(401, { message: 'Bad credentials' })
      await expect(
        deleteBranchRef({ branch: 'b', repo: 'octo/lib', token: 'bad' }),
      ).rejects.toThrow('HTTP 401')
    })

    it('propagates network-level failures', async () => {
      nock(GITHUB_API)
        .delete('/repos/octo/lib/git/refs/heads/b')
        .replyWithError('ECONNRESET')
      await expect(
        deleteBranchRef({ branch: 'b', repo: 'octo/lib', token: 'tok' }),
      ).rejects.toThrow()
    })
  })
})

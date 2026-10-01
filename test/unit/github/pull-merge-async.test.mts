/**
 * @file Unit tests for the GitHub merge-async helpers. The transport is
 *   mocked with nock at the node:http boundary; request bodies, methods, and
 *   auth headers are asserted on the intercepted calls.
 */

import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getPullRequestMergeResult,
  pullMergeHeaders,
  requestPullRequestMerge,
} from '../../../src/github/pull-merge-async.mjs'

const GITHUB_API = 'https://api.github.com'
const SHA = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3'
const UUID = '6f9d2a10-1b2c-4d3e-8f40-9a1b2c3d4e5f'

const PENDING_RESULT = {
  details: {
    expectedHeadSha: SHA,
    mergeAction: 'default',
    mergeMethod: 'default',
    message: 'Merge request accepted',
    uuid: UUID,
  },
  status: 'pending',
}

describe('github/pull-merge-async', () => {
  beforeEach(() => {
    nock.disableNetConnect()
    nock.cleanAll()
    // Keep getGitHubToken()'s env fallback deterministic.
    vi.stubEnv('GITHUB_TOKEN', '')
    vi.stubEnv('GH_TOKEN', '')
  })

  afterEach(() => {
    nock.cleanAll()
    vi.unstubAllEnvs()
  })

  describe('pullMergeHeaders', () => {
    it('carries the JSON accept/content-type and the merge-async API version', () => {
      const headers = pullMergeHeaders('tok')
      expect(headers['accept']).toBe('application/vnd.github+json')
      expect(headers['content-type']).toBe('application/json')
      expect(headers['x-github-api-version']).toBe('2026-03-10')
      expect(headers['authorization']).toBe('Bearer tok')
    })

    it('omits authorization when no token resolves', () => {
      expect(pullMergeHeaders()['authorization']).toBeUndefined()
    })

    it('falls back to the env token when none is passed', () => {
      vi.stubEnv('GITHUB_TOKEN', 'env-token')
      expect(pullMergeHeaders()['authorization']).toBe('Bearer env-token')
    })
  })

  describe('requestPullRequestMerge', () => {
    it('PUTs merge-async with only the set fields and resolves the pending result', async () => {
      let body: unknown
      nock(GITHUB_API, {
        reqheaders: { authorization: 'Bearer tok' },
      })
        .put('/repos/octo/lib/pulls/42/merge-async', (b: unknown) => {
          body = b
          return true
        })
        .reply(202, PENDING_RESULT)
      const result = await requestPullRequestMerge({
        pullNumber: 42,
        repo: 'octo/lib',
        sha: SHA,
        token: 'tok',
      })
      expect(body).toEqual({ sha: SHA })
      expect(result.status).toBe('pending')
      expect(result.details).toEqual(PENDING_RESULT.details)
    })

    it('sends direct-merge options when given', async () => {
      let body: unknown
      nock(GITHUB_API)
        .put('/repos/octo/lib/pulls/7/merge-async', (b: unknown) => {
          body = b
          return true
        })
        .reply(202, PENDING_RESULT)
      await requestPullRequestMerge({
        bypassRules: true,
        commitMessage: 'Avoids a race',
        commitTitle: 'Fix race condition',
        mergeAction: 'direct_merge',
        mergeMethod: 'squash',
        pullNumber: 7,
        repo: 'octo/lib',
        sha: SHA,
        token: 'tok',
      })
      expect(body).toEqual({
        bypass_rules: true,
        commit_message: 'Avoids a race',
        commit_title: 'Fix race condition',
        merge_action: 'direct_merge',
        merge_method: 'squash',
        sha: SHA,
      })
    })

    it('resolves a merged result on 200', async () => {
      nock(GITHUB_API)
        .put('/repos/octo/lib/pulls/42/merge-async')
        .reply(200, {
          details: { message: 'Pull request merged', sha: SHA },
          status: 'merged',
        })
      const result = await requestPullRequestMerge({
        pullNumber: 42,
        repo: 'octo/lib',
        token: 'tok',
      })
      expect(result.status).toBe('merged')
      expect(result.details).toEqual({
        message: 'Pull request merged',
        sha: SHA,
      })
    })

    it('surfaces an already-pending 409 as a pending result', async () => {
      nock(GITHUB_API)
        .put('/repos/octo/lib/pulls/42/merge-async')
        .reply(409, PENDING_RESULT)
      const result = await requestPullRequestMerge({
        pullNumber: 42,
        repo: 'octo/lib',
        token: 'tok',
      })
      expect(result.status).toBe('pending')
      expect((result.details as { uuid: string }).uuid).toBe(UUID)
    })

    it('throws HttpResponseError when the PR is not mergeable (400)', async () => {
      nock(GITHUB_API)
        .put('/repos/octo/lib/pulls/42/merge-async')
        .reply(400, { message: 'Pull request is not mergeable' })
      await expect(
        requestPullRequestMerge({
          pullNumber: 42,
          repo: 'octo/lib',
          token: 'tok',
        }),
      ).rejects.toThrow('HTTP 400')
    })

    it('honors an apiUrl override', async () => {
      const scope = nock('https://ghe.example.test')
        .put('/repos/octo/lib/pulls/42/merge-async')
        .reply(202, PENDING_RESULT)
      await requestPullRequestMerge({
        apiUrl: 'https://ghe.example.test',
        pullNumber: 42,
        repo: 'octo/lib',
        token: 'tok',
      })
      expect(scope.isDone()).toBe(true)
    })
  })

  describe('getPullRequestMergeResult', () => {
    it('GETs merge-async/<uuid> and resolves the result', async () => {
      const scope = nock(GITHUB_API, {
        reqheaders: { authorization: 'Bearer tok' },
      })
        .get(`/repos/octo/lib/pulls/42/merge-async/${UUID}`)
        .reply(200, PENDING_RESULT)
      const result = await getPullRequestMergeResult({
        pullNumber: 42,
        repo: 'octo/lib',
        token: 'tok',
        uuid: UUID,
      })
      expect(scope.isDone()).toBe(true)
      expect(result.status).toBe('pending')
    })

    it('resolves a failed result with its message', async () => {
      nock(GITHUB_API)
        .get(`/repos/octo/lib/pulls/42/merge-async/${UUID}`)
        .reply(200, {
          details: { message: 'Required status check failed' },
          status: 'failed',
        })
      const result = await getPullRequestMergeResult({
        pullNumber: 42,
        repo: 'octo/lib',
        token: 'tok',
        uuid: UUID,
      })
      expect(result.status).toBe('failed')
      expect((result.details as { message: string }).message).toBe(
        'Required status check failed',
      )
    })

    it('throws HttpResponseError once the result expired (404)', async () => {
      nock(GITHUB_API)
        .get(`/repos/octo/lib/pulls/42/merge-async/${UUID}`)
        .reply(404, { message: 'Not Found' })
      await expect(
        getPullRequestMergeResult({
          pullNumber: 42,
          repo: 'octo/lib',
          token: 'tok',
          uuid: UUID,
        }),
      ).rejects.toThrow('HTTP 404')
    })
  })
})

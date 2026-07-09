/**
 * @file Unit tests for the workflow-run release-gate primitive. The pure
 *   helpers (classifyRunVerdict, buildWorkflowRunsUrl, selectLatestRun) are
 *   tested directly; the I/O helpers (getRunForCommit, waitForRun) mock the
 *   GitHub REST API with nock under disableNetConnect(). waitForRun runs with
 *   pollIntervalMs: 0 so the polling loop is exercised without real delays.
 */

import nock from 'nock'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  buildWorkflowRunsUrl,
  classifyRunVerdict,
  getRunForCommit,
  selectLatestRun,
  waitForRun,
} from '../../../src/github/workflow-runs'

const API = 'https://api.github.com'
const RUNS_PATH = '/repos/o/r/actions/workflows/ci.yml/runs'
const QUERY = {
  owner: 'o',
  repo: 'r',
  sha: 's',
  token: 'tok',
  workflow: 'ci.yml',
}

beforeAll(() => {
  nock.disableNetConnect()
})

afterAll(() => {
  nock.enableNetConnect()
})

afterEach(() => {
  nock.cleanAll()
})

describe('classifyRunVerdict', () => {
  it('completed + success → green', () => {
    expect(classifyRunVerdict('completed', 'success')).toBe('green')
  })

  it('completed + non-success → red', () => {
    expect(classifyRunVerdict('completed', 'failure')).toBe('red')
    expect(classifyRunVerdict('completed', 'cancelled')).toBe('red')
    expect(classifyRunVerdict('completed', 'timed_out')).toBe('red')
    expect(classifyRunVerdict('completed', undefined)).toBe('red')
  })

  it('not-yet-completed → pending', () => {
    expect(classifyRunVerdict('in_progress', undefined)).toBe('pending')
    expect(classifyRunVerdict('queued', undefined)).toBe('pending')
    expect(classifyRunVerdict(undefined, undefined)).toBe('pending')
  })
})

describe('buildWorkflowRunsUrl', () => {
  it('builds the workflow-scoped, single-result runs URL', () => {
    expect(
      buildWorkflowRunsUrl({
        owner: 'o',
        repo: 'r',
        sha: 'abc123',
        workflow: 'ci.yml',
      }),
    ).toBe(
      'https://api.github.com/repos/o/r/actions/workflows/ci.yml/runs?head_sha=abc123&per_page=1',
    )
  })
})

describe('selectLatestRun', () => {
  it('normalizes the first run (null conclusion → undefined)', () => {
    expect(
      selectLatestRun({
        workflow_runs: [
          {
            conclusion: undefined,
            html_url: 'u',
            id: 7,
            status: 'in_progress',
          },
        ],
      }),
    ).toEqual({
      conclusion: undefined,
      htmlUrl: 'u',
      id: 7,
      status: 'in_progress',
    })
  })

  it('returns undefined when there are no runs', () => {
    expect(selectLatestRun({ workflow_runs: [] })).toBeUndefined()
    expect(selectLatestRun({})).toBeUndefined()
  })
})

describe('getRunForCommit', () => {
  it('fetches and normalizes the newest run', async () => {
    const scope = nock(API)
      .get(RUNS_PATH)
      .query(true)
      .reply(200, {
        workflow_runs: [
          { conclusion: 'success', html_url: 'h', id: 42, status: 'completed' },
        ],
      })
    const run = await getRunForCommit(QUERY)
    expect(run).toEqual({
      conclusion: 'success',
      htmlUrl: 'h',
      id: 42,
      status: 'completed',
    })
    scope.done()
  })

  it('returns undefined when no run exists for the sha', async () => {
    const scope = nock(API)
      .get(RUNS_PATH)
      .query(true)
      .reply(200, { workflow_runs: [] })
    expect(await getRunForCommit(QUERY)).toBeUndefined()
    scope.done()
  })

  it('omits the token option when none is provided', async () => {
    const scope = nock(API)
      .get(RUNS_PATH)
      .query(true)
      .reply(200, {
        workflow_runs: [{ conclusion: 'success', id: 9, status: 'completed' }],
      })
    const run = await getRunForCommit({
      owner: 'o',
      repo: 'r',
      sha: 's',
      workflow: 'ci.yml',
    })
    expect(run?.id).toBe(9)
    scope.done()
  })
})

describe('waitForRun', () => {
  it('polls until the run completes, then returns the verdict', async () => {
    const scope = nock(API)
      .get(RUNS_PATH)
      .query(true)
      .reply(200, {
        workflow_runs: [
          { conclusion: undefined, id: 1, status: 'in_progress' },
        ],
      })
      .get(RUNS_PATH)
      .query(true)
      .reply(200, {
        workflow_runs: [{ conclusion: 'success', id: 1, status: 'completed' }],
      })
    const result = await waitForRun({
      ...QUERY,
      maxAttempts: 5,
      pollIntervalMs: 0,
    })
    expect(result.verdict).toBe('green')
    expect(result.run?.id).toBe(1)
    scope.done()
  })

  it('resolves red immediately on a failed run', async () => {
    const scope = nock(API)
      .get(RUNS_PATH)
      .query(true)
      .reply(200, {
        workflow_runs: [{ conclusion: 'failure', id: 1, status: 'completed' }],
      })
    const result = await waitForRun({
      ...QUERY,
      maxAttempts: 5,
      pollIntervalMs: 0,
    })
    expect(result.verdict).toBe('red')
    scope.done()
  })

  it('gives up as pending after maxAttempts', async () => {
    const scope = nock(API)
      .get(RUNS_PATH)
      .query(true)
      .reply(200, {
        workflow_runs: [{ conclusion: undefined, id: 1, status: 'queued' }],
      })
      .get(RUNS_PATH)
      .query(true)
      .reply(200, {
        workflow_runs: [{ conclusion: undefined, id: 1, status: 'queued' }],
      })
    const result = await waitForRun({
      ...QUERY,
      maxAttempts: 2,
      pollIntervalMs: 0,
    })
    expect(result.verdict).toBe('pending')
    scope.done()
  })

  it('applies default poll bounds when none are given', async () => {
    const scope = nock(API)
      .get(RUNS_PATH)
      .query(true)
      .reply(200, {
        workflow_runs: [{ conclusion: 'success', id: 1, status: 'completed' }],
      })
    // Omit maxAttempts + pollIntervalMs so the `?? default` branches run; the
    // immediate green verdict breaks before any sleep, so no real delay.
    const result = await waitForRun(QUERY)
    expect(result.verdict).toBe('green')
    scope.done()
  })
})

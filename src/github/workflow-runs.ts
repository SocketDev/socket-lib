/**
 * @file Look up a GitHub Actions workflow run for a commit and classify its
 *   verdict — the "is CI green on this SHA?" primitive behind gated releases
 *   (bump/tag/publish only after the pre-release commit's CI passes). Built on
 *   the shared `fetchGitHub` REST client, so it inherits token resolution +
 *   rate-limit handling and needs no `gh` CLI. The pure helpers
 *   (`classifyRunVerdict`, `buildWorkflowRunsUrl`, `selectLatestRun`) hold the
 *   logic; `getRunForCommit` / `waitForRun` are the thin I/O wrappers.
 */

import { sleep } from '../promises/timers'
import { fetchGitHub } from './request'

/**
 * Build the GitHub REST URL that lists the runs of `workflow` for `sha`,
 * newest first, capped to one. Pure.
 */
export function buildWorkflowRunsUrl(query: WorkflowRunQuery): string {
  const opts = { __proto__: null, ...query } as WorkflowRunQuery
  const { owner, repo, sha, workflow } = opts
  return `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?head_sha=${sha}&per_page=1`
}

/**
 * A workflow run's terminal verdict, normalized from GitHub's `status` +
 * `conclusion` pair. `pending` = the run has not completed yet.
 */
export type WorkflowRunVerdict = 'green' | 'pending' | 'red'

/**
 * A GitHub Actions workflow run, narrowed to the fields a release gate needs.
 * `conclusion` is `undefined` until the run reaches `status === 'completed'`.
 */
export interface WorkflowRun {
  conclusion: string | undefined
  htmlUrl: string | undefined
  id: number
  status: string
}

/**
 * One entry in the `GET .../runs` response, as GitHub returns it (snake_case,
 * `conclusion` nullable until completion).
 */
export interface WorkflowRunApiEntry {
  conclusion?: string | null | undefined
  html_url?: string | undefined
  id: number
  status: string
}

/**
 * The `GET /repos/{owner}/{repo}/actions/workflows/{workflow}/runs` response
 * shape, narrowed to `workflow_runs`.
 */
export interface WorkflowRunsApiResponse {
  workflow_runs?: WorkflowRunApiEntry[] | undefined
}

/**
 * Identifies the workflow run to resolve: a repo, a commit SHA, and the
 * workflow to scope to.
 */
export interface WorkflowRunQuery {
  owner: string
  repo: string
  sha: string
  token?: string | undefined
  /**
   * Workflow file name (e.g. `ci.yml`) or numeric workflow id. Scopes the
   * lookup so a repo with many workflows resolves the intended run.
   */
  workflow: string
}

/**
 * Options for `waitForRun`: a `WorkflowRunQuery` plus polling bounds.
 */
export interface WaitForRunOptions extends WorkflowRunQuery {
  /**
   * Maximum number of polls before giving up and returning the last verdict
   * (usually `pending`). Default 120 (~10 min at the default interval).
   */
  maxAttempts?: number | undefined
  /**
   * Milliseconds between polls. Default 5000. Pass `0` in tests.
   */
  pollIntervalMs?: number | undefined
}

/**
 * The result of `waitForRun`: the final verdict and the last run observed
 * (`undefined` when no run ever appeared for the SHA).
 */
export interface WaitForRunResult {
  run: WorkflowRun | undefined
  verdict: WorkflowRunVerdict
}

/**
 * Classify a run's `status` + `conclusion` into a release verdict. Pure — a run
 * that has not `completed` is `pending`; a completed run is `green` only when
 * it `succeeded`, otherwise `red` (failure, cancelled, timed_out, …).
 */
export function classifyRunVerdict(
  status: string | undefined,
  conclusion: string | undefined,
): WorkflowRunVerdict {
  if (status !== 'completed') {
    return 'pending'
  }
  return conclusion === 'success' ? 'green' : 'red'
}

/**
 * Fetch the newest workflow run for `sha`, or `undefined` when none has been
 * created yet (CI may not have triggered at read time).
 */
export async function getRunForCommit(
  query: WorkflowRunQuery,
): Promise<WorkflowRun | undefined> {
  const opts = { __proto__: null, ...query } as WorkflowRunQuery
  const url = buildWorkflowRunsUrl(opts)
  const response = await fetchGitHub<WorkflowRunsApiResponse>(
    url,
    opts.token ? { token: opts.token } : undefined,
  )
  return selectLatestRun(response)
}

/**
 * Pick the newest run from a `GET .../runs` response and normalize it to a
 * `WorkflowRun` (nullable `conclusion` → `undefined`). Returns `undefined` when
 * no run exists for the SHA. Pure.
 */
export function selectLatestRun(
  response: WorkflowRunsApiResponse,
): WorkflowRun | undefined {
  const opts = { __proto__: null, ...response } as WorkflowRunsApiResponse
  const raw = opts.workflow_runs?.[0]
  if (!raw) {
    return undefined
  }
  return {
    conclusion: raw.conclusion ?? undefined,
    htmlUrl: raw.html_url ?? undefined,
    id: raw.id,
    status: raw.status,
  }
}

/**
 * Poll the workflow run for `sha` until it completes (or the attempt budget is
 * spent), returning the final verdict and the last run seen. A `red` or `green`
 * verdict resolves immediately; `pending` (no run yet, or still running) keeps
 * polling every `pollIntervalMs` up to `maxAttempts`.
 */
export async function waitForRun(
  options: WaitForRunOptions,
): Promise<WaitForRunResult> {
  const opts = { __proto__: null, ...options } as WaitForRunOptions
  const maxAttempts = opts.maxAttempts ?? 120
  const pollIntervalMs = opts.pollIntervalMs ?? 5000
  let run: WorkflowRun | undefined
  let verdict: WorkflowRunVerdict = 'pending'
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    run = await getRunForCommit(opts)
    verdict = classifyRunVerdict(run?.status, run?.conclusion)
    if (verdict !== 'pending') {
      break
    }
    if (attempt < maxAttempts - 1) {
      await sleep(pollIntervalMs)
    }
  }
  return { run, verdict }
}

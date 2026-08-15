/**
 * @file The `gh` CLI runner, and `gh api` on top of it.
 *   Why a CLI lane at all when `github/request.ts` speaks REST directly: `gh`
 *   already holds the operator's credential, including SSO-authorized and
 *   keyring-stored tokens a script cannot read, and it covers endpoints the
 *   REST helper does not model. Scripts reach for it constantly, which is how
 *   four private wrappers grew in one repo, each with its own error contract
 *   and only one of them encoding request bodies correctly.
 *   Three details this owns so no caller repeats them:
 *
 *   1. FIELD ENCODING. `gh api` takes `-F` for a raw JSON value and `-f` for a
 *      string. Send a boolean through `-f` and the API receives `"true"`, the
 *      string, which a settings PATCH silently accepts and stores wrong.
 *   2. A BODY ARRIVES BY FILE. The lib spawn does not wire the child's stdin, so
 *      `gh api --input -` reads nothing and the request goes out empty. The
 *      body is written to a temp file and the `{body}` placeholder in `args` is
 *      replaced with its path.
 *   3. NON-ZERO RESOLVES. A missing check run, an absent ruleset, a 404 on a repo
 *      property are all STATES to report, not crashes. The runner resolves with
 *      the exit code so a caller branches on it; `formatGhFailure` is there for
 *      the callers that do want to fail loud.
 */

import { debugLog } from '../debug/output'
import { getNodeFs } from '../node/fs'
import { getNodeOs } from '../node/os'
import { getNodePath } from '../node/path'
import { spawn } from '../process/spawn/child'
import { safeDeleteSync } from '../fs/safe'

/**
 * How long a `gh` invocation may run before it is killed. A CLI call that has
 * not answered in this long is unresponsive rather than slow: `gh` does its own
 * network retries well inside it.
 */
export const GH_DEFAULT_TIMEOUT_MS = 30_000

/**
 * The placeholder in `args` that a request body's temp-file path replaces.
 */
export const GH_BODY_PLACEHOLDER = '{body}'

/**
 * Options for {@link ghApi}. `jq` asks `gh` to filter server-side, which then
 * yields plain text rather than JSON, so pair it with {@link ghApiText}.
 */
export interface GhApiOptions extends RunGhOptions {
  readonly fields?: Record<string, unknown> | undefined
  readonly method?: string | undefined
}

/**
 * The `gh api` argv for `endpoint`, before it runs. Pure, so a test can assert
 * the encoding without spawning.
 */
export function buildGhApiArgs(
  endpoint: string,
  options?: GhApiOptions | undefined,
): string[] {
  const { fields, method } = { __proto__: null, ...options } as GhApiOptions
  const args = ['api', endpoint]
  // GET is gh's default, so naming it adds an argument that says nothing.
  if (method && method !== 'GET') {
    args.push('-X', method)
  }
  if (fields) {
    args.push(...encodeGhFieldArgs(fields))
  }
  return args
}

/**
 * What a `gh` invocation produced. `ok` is the same fact as `exitCode === 0`,
 * carried separately because it is what most call sites actually branch on.
 */
export interface GhResult {
  readonly exitCode: number
  readonly ok: boolean
  readonly stderr: string
  readonly stdout: string
}

/**
 * Options for {@link runGh}. `body` is JSON text written to a temp file whose
 * path replaces {@link GH_BODY_PLACEHOLDER}. `spawnGh` is the injectable launch
 * injection point, so a test drives the runner without a `gh` binary present.
 */
export interface RunGhOptions {
  readonly body?: string | undefined
  readonly cwd?: string | undefined
  readonly spawnGh?: typeof spawn | undefined
  readonly timeout?: number | undefined
}

/**
 * The `-f` / `-F` argument pairs for a request body.
 *
 * A string goes through `-f` verbatim. Everything else — boolean, number, null,
 * array, object — is a raw JSON value and goes through `-F` as its JSON text,
 * because `-f` would stringify it and the API would store the quoted form.
 *
 * Pure, and exported because this encoding is the part that is wrong in a
 * hand-rolled copy.
 */
export function encodeGhFieldArgs(body: Record<string, unknown>): string[] {
  const args: string[] = []
  const keys = Object.keys(body)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    const value = body[key]
    if (typeof value === 'string') {
      args.push('-f', `${key}=${value}`)
      continue
    }
    args.push('-F', `${key}=${JSON.stringify(value)}`)
  }
  return args
}

/**
 * The four-ingredient message for a `gh` call that failed, for a caller that
 * wants to fail loud rather than branch on the exit code.
 */
export function formatGhFailure(description: string, result: GhResult): string {
  return (
    `gh ${description} failed.\n` +
    `  Where: ${description}\n` +
    `  Saw:   exit ${result.exitCode} — ${result.stderr || '(no stderr)'}\n` +
    '  Fix:   check `gh auth status` and network access to api.github.com.'
  )
}

/**
 * Call `gh api <endpoint>` and parse the JSON it returns.
 *
 * Answers `undefined` for every shape that is not parseable JSON — a non-zero
 * exit, an empty body, a malformed document. That is deliberate: the endpoints
 * this serves are largely optional-by-nature reads, where absent and failed are
 * the same non-answer, and a caller that needs the difference reads
 * {@link runGh} directly. A failing call is logged at debug level so the
 * silence is never total.
 */
export async function ghApi<T>(
  endpoint: string,
  options?: GhApiOptions | undefined,
): Promise<T | undefined> {
  const result = await runGh(buildGhApiArgs(endpoint, options), options)
  if (!result.ok) {
    debugLog(
      `gh api ${endpoint} failed: exit ${result.exitCode} ${result.stderr}`,
    )
    return undefined
  }
  if (!result.stdout) {
    return undefined
  }
  try {
    return JSON.parse(result.stdout) as T
  } catch {
    debugLog(`gh api ${endpoint} returned unparseable JSON`)
    return undefined
  }
}

/**
 * Call `gh api <endpoint> --jq <filter>` and return the trimmed text.
 *
 * A `--jq` filter makes `gh` emit plain text rather than JSON, so this is the
 * text-shaped sibling of {@link ghApi} rather than a variant of it. Answers
 * `undefined` on a failed call, so a caller decides between a default and
 * {@link formatGhFailure}.
 */
export async function ghApiText(
  endpoint: string,
  jq: string,
  options?: GhApiOptions | undefined,
): Promise<string | undefined> {
  const args = [...buildGhApiArgs(endpoint, options), '--jq', jq]
  const result = await runGh(args, options)
  if (!result.ok) {
    debugLog(
      `gh api ${endpoint} --jq failed: exit ${result.exitCode} ${result.stderr}`,
    )
    return undefined
  }
  return result.stdout
}

/**
 * Run `gh` with `args` and capture both streams.
 *
 * Never throws for a non-zero exit: that is a state the caller reports. A
 * genuine spawn failure — no `gh` on PATH, a timeout — also resolves, with the
 * exit code the failure carried and its message on `stderr`, so one branch
 * handles every unhappy path.
 */
export async function runGh(
  args: readonly string[],
  options?: RunGhOptions | undefined,
): Promise<GhResult> {
  const {
    body,
    cwd,
    spawnGh = spawn,
    timeout = GH_DEFAULT_TIMEOUT_MS,
  } = { __proto__: null, ...options } as RunGhOptions
  const fs = getNodeFs()
  const os = getNodeOs()
  const path = getNodePath()
  let bodyFile: string | undefined
  let resolved = [...args]
  if (body !== undefined) {
    bodyFile = path.join(
      os.tmpdir(),
      `socket-gh-${process.pid}-${args.length}.json`,
    )
    fs.writeFileSync(bodyFile, body)
    resolved = resolved.map(arg =>
      arg === GH_BODY_PLACEHOLDER ? bodyFile! : arg,
    )
  }
  try {
    const result = await spawnGh('gh', resolved, {
      ...(cwd ? { cwd } : {}),
      stdio: 'pipe',
      stdioString: true,
      timeout,
    })
    const exitCode = result.code ?? 0
    return {
      exitCode,
      ok: exitCode === 0,
      stderr: String(result.stderr ?? '').trim(),
      stdout: String(result.stdout ?? '').trim(),
    }
  } catch (e) {
    const err = e as {
      code?: unknown | undefined
      message?: unknown | undefined
      stderr?: unknown | undefined
      stdout?: unknown | undefined
    }
    // A command-not-found rejects with a string `code` (ENOENT), which is not
    // an exit status, so it reports as 1 rather than as NaN.
    const exitCode = typeof err.code === 'number' ? err.code : 1
    const stderr = String(err.stderr ?? err.message ?? '').trim()
    return {
      exitCode,
      ok: false,
      stderr,
      stdout: String(err.stdout ?? '').trim(),
    }
  } finally {
    if (bodyFile) {
      try {
        safeDeleteSync(bodyFile)
      } catch {
        // A leftover temp file is not worth failing the call the body served.
      }
    }
  }
}

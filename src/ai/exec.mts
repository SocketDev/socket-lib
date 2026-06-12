/**
 * @file Exec-backend seam: WHERE a shell command runs, a separate axis from
 *   WHICH model produced it (`ai/backends`). The lib owns the INTERFACE plus
 *   the cheap built-in `real` runner (the host shell via lib `spawn`); a
 *   SANDBOXED runner is INJECTED by the caller, never imported here. That keeps
 *   the small-dist lib free of a heavy sandbox dependency — the fleet's sandbox
 *   of choice (`just-bash`, ~40MB incl. WASM) is owned by the wheelhouse hook /
 *   CI tooling and passed in, so a lib consumer that never sandboxes pays
 *   nothing. Layering: ExecRunner.run() — the injectable primitive (real |
 *   sandboxed) composed into ExecContext — { runners: { real, sandboxed? },
 *   resolve(trust) } used by runShell(script, { context, trust }) — the
 *   ergonomic entry point Pick a runner by TRUST LEVEL, never by model.
 *   `untrusted` resolves to the sandboxed runner — which a caller that hasn't
 *   injected one cannot run, so `resolve` throws a clear "provide a sandboxed
 *   runner" error rather than silently falling back to the host shell. Both
 *   runners normalize to one `ExecResult` so callers swap trust levels without
 *   reshaping result handling.
 */

import { spawn } from '../process/spawn/child'
import { isSpawnError } from '../process/spawn/errors'

// Where the shell runs: the host FS (`real`) or an injected sandbox.
export type ExecBackend = 'real' | 'sandboxed'

// Trust level of the script's source. Untrusted (model-generated, third-party,
// unreviewed) routes to the sandbox; trusted routes to the host shell.
export type ExecTrust = 'trusted' | 'untrusted'

// Normalized result shape every runner returns.
export interface ExecResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

// Per-run options handed to a runner. `files` seeds a sandbox's virtual FS and
// is ignored by the real runner (which already sees the host FS).
export interface ExecRunOptions {
  readonly cwd?: string | undefined
  readonly env?: Record<string, string> | undefined
  readonly files?: Record<string, string> | undefined
  readonly signal?: AbortSignal | undefined
  readonly stdin?: string | undefined
}

// The injectable execution primitive: run one script, resolve to an ExecResult
// (a non-zero exit is a result, never a throw — both real and injected runners
// MUST honor this so callers branch on exitCode, not try/catch).
export interface ExecRunner {
  run(script: string, options?: ExecRunOptions | undefined): Promise<ExecResult>
}

// Registry of runners + the trust→runner policy. `real` is always present
// (the lib provides it); `sandboxed` is whatever the caller injected, if any.
export interface ExecContext {
  readonly runners: {
    readonly real: ExecRunner
    readonly sandboxed?: ExecRunner | undefined
  }
  // Map a trust level to a concrete runner. Throws when `untrusted` is asked
  // for but no sandboxed runner was injected — never silently downgrades to the
  // host shell.
  resolve(trust: ExecTrust): ExecRunner
}

// The built-in `real` runner: the host shell via lib spawn. `bash -c <script>`
// so the script string is interpreted, matching a sandbox's single-string exec.
// Exported so a caller can compose or wrap it.
export const realRunner: ExecRunner = {
  async run(
    script: string,
    options?: ExecRunOptions | undefined,
  ): Promise<ExecResult> {
    const { cwd, env, signal } = {
      __proto__: null,
      ...options,
    } as ExecRunOptions
    // NOTE: `stdin` is intentionally NOT forwarded to the real runner. lib
    // `spawn` exposes stdin only via the interactive `result.stdin` stream
    // (write/end), which doesn't fit a one-shot run; piping without closing
    // hangs a reader like `cat`. A script needing stdin should use a sandboxed
    // runner (which feeds stdin in-memory) or embed the data via a here-doc.
    const spawnOptions = {
      ...(cwd ? { cwd } : {}),
      ...(env ? { env } : {}),
      ...(signal ? { signal } : {}),
      stdioString: true,
    }
    try {
      const result = await spawn('bash', ['-c', script], spawnOptions)
      return {
        stdout: String(result.stdout ?? ''),
        stderr: String(result.stderr ?? ''),
        // Resolved result carries the status on `code` (0 here — a non-zero
        // exit rejects, handled below).
        exitCode: typeof result.code === 'number' ? result.code : 0,
      }
    } catch (e) {
      // lib spawn (via @npmcli/promise-spawn) REJECTS on a non-zero exit; an
      // ExecRunner must surface that as a result, so normalize a SpawnError.
      // A non-SpawnError (failed to launch, e.g. no bash) is a genuine fault.
      if (!isSpawnError(e)) {
        throw e
      }
      return {
        stdout: String(e.stdout ?? ''),
        stderr: String(e.stderr ?? ''),
        // A signal-kill (code null) becomes non-zero so it isn't read as
        // success.
        exitCode: typeof e.code === 'number' ? e.code : 1,
      }
    }
  },
}

// Map a trust level to a backend name. The single decision point so callers
// express intent ("this script is untrusted") rather than naming a backend.
export function backendForTrust(trust: ExecTrust): ExecBackend {
  return trust === 'trusted' ? 'real' : 'sandboxed'
}

// Build an ExecContext. `real` is the lib's built-in runner unless overridden;
// pass `sandboxed` (e.g. the wheelhouse's just-bash-backed runner) to enable the
// untrusted path. `resolve` throws when the untrusted path is used without one.
export function createExecContext(
  options?:
    | { real?: ExecRunner | undefined; sandboxed?: ExecRunner | undefined }
    | undefined,
): ExecContext {
  const { real = realRunner, sandboxed } = {
    __proto__: null,
    ...options,
  } as { real?: ExecRunner | undefined; sandboxed?: ExecRunner | undefined }
  const runners = { real, sandboxed }
  return {
    runners,
    resolve(trust: ExecTrust): ExecRunner {
      if (backendForTrust(trust) === 'real') {
        return runners.real
      }
      if (!runners.sandboxed) {
        throw new Error(
          'No sandboxed exec runner provided.\n' +
            '→ An `untrusted` script must run in a sandbox, not the host shell.\n' +
            '→ Fix: pass a `sandboxed` runner to createExecContext() (e.g. the ' +
            'wheelhouse just-bash runner), or mark the script `trusted` if it is.',
        )
      }
      return runners.sandboxed
    },
  }
}

// Run `script` under the context's runner for `trust`. Defaults: a real-only
// context (so `trusted` works out of the box) and `untrusted` trust (fail safe —
// an unspecified caller is routed to the sandbox, which errors loudly if none
// was injected rather than quietly using the host shell).
export async function runShell(
  script: string,
  options?:
    | (ExecRunOptions & {
        context?: ExecContext | undefined
        trust?: ExecTrust | undefined
      })
    | undefined,
): Promise<ExecResult> {
  const {
    context,
    cwd,
    env,
    files,
    signal,
    stdin,
    trust = 'untrusted',
  } = { __proto__: null, ...options } as ExecRunOptions & {
    context?: ExecContext | undefined
    trust?: ExecTrust | undefined
  }
  const ctx = context ?? createExecContext()
  return await ctx
    .resolve(trust)
    .run(script, { cwd, env, files, signal, stdin })
}

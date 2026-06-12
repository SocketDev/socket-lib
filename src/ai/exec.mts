/**
 * @file Exec-backend seam: WHERE a shell command runs, as a separate axis from
 *   WHICH model produced it (that's `ai/backends`). Two backends:
 *
 *   - `real` — the host shell via the lib `spawn` (`bash -c <script>`). Touches
 *     the actual filesystem. The default for trusted, intentional work.
 *   - `sandboxed` — `just-bash`, an in-process virtual-filesystem bash
 *     interpreter (zero host FS access, zero model calls). For running
 *     model-generated or otherwise untrusted shell safely — eval harnesses,
 *     agent self-test, vetting a script before trusting it. Pick the backend by
 *     TRUST LEVEL (`resolveExecBackend`), never by model. `just-bash` is
 *     deliberately NOT a `ai/backends` entry: it makes no model call and
 *     produces no attributed model output, so it belongs here, not in the
 *     model-CLI registry the `backend-routing-is-legal` check guards. Both
 *     backends normalize to one `ExecResult` ({ stdout, stderr, exitCode }) so
 *     a caller can swap trust levels without reshaping its result handling.
 */

import { Bash } from 'just-bash'

import { spawn } from '../process/spawn/child'
import { isSpawnError } from '../process/spawn/errors'

import type { ExecOptions as JustBashExecOptions } from 'just-bash'

// Where the shell runs. `real` = host FS via lib spawn; `sandboxed` =
// in-process just-bash virtual FS.
export type ExecBackend = 'real' | 'sandboxed'

// Trust level of the script's source. Untrusted (model-generated, third-party,
// unreviewed) routes to the sandbox; trusted routes to the real shell.
export type ExecTrust = 'trusted' | 'untrusted'

// Normalized result shape shared by both backends.
export interface ExecResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface RunShellOptions {
  // Which exec backend to use. Defaults to `sandboxed` — fail safe: an
  // unspecified caller gets the no-host-FS path, not the real shell.
  readonly backend?: ExecBackend | undefined
  readonly cwd?: string | undefined
  readonly env?: Record<string, string> | undefined
  readonly signal?: AbortSignal | undefined
  readonly stdin?: string | undefined
  // Seed files for the sandboxed virtual FS (path → contents). Ignored by the
  // real backend, which already sees the host FS.
  readonly files?: Record<string, string> | undefined
}

// Map a trust level to its exec backend. The single decision point so callers
// express intent ("this script is untrusted") rather than wiring a backend.
export function resolveExecBackend(trust: ExecTrust): ExecBackend {
  return trust === 'trusted' ? 'real' : 'sandboxed'
}

// `real` backend: the host shell via lib spawn. `bash -c <script>` so the
// script string is interpreted, matching just-bash's single-string exec.
// Exported (fleet: privacy is by not-importing); callers use `runShell`.
export async function runReal(
  script: string,
  options: Pick<RunShellOptions, 'cwd' | 'env' | 'signal' | 'stdin'>,
): Promise<ExecResult> {
  const { cwd, env, signal, stdin } = {
    __proto__: null,
    ...options,
  } as typeof options
  const spawnOptions = {
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
    ...(signal ? { signal } : {}),
    ...(stdin !== undefined ? { input: stdin } : {}),
    stdioString: true,
  }
  try {
    const result = await spawn('bash', ['-c', script], spawnOptions)
    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
      // The resolved result carries the exit status on `code` (always 0 here,
      // since a non-zero exit rejects — handled in the catch below).
      exitCode: typeof result.code === 'number' ? result.code : 0,
    }
  } catch (e) {
    // lib spawn (via @npmcli/promise-spawn) REJECTS on a non-zero exit. Both
    // exec backends must surface a non-zero exit as a result, not a throw, so
    // normalize a SpawnError into ExecResult. A non-SpawnError (spawn failed to
    // launch, e.g. no bash) is a genuine fault — rethrow it.
    if (!isSpawnError(e)) {
      throw e
    }
    return {
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
      // A signal-kill (code null) becomes non-zero so callers don't read it as
      // success.
      exitCode: typeof e.code === 'number' ? e.code : 1,
    }
  }
}

// `sandboxed` backend: in-process just-bash. Seed `files` into the virtual FS
// before running, so a caller can hand the model a fixture tree without
// touching the host. Exported (fleet: privacy is by not-importing); callers
// use `runShell`.
export async function runSandboxed(
  script: string,
  options: Pick<RunShellOptions, 'cwd' | 'env' | 'files' | 'signal' | 'stdin'>,
): Promise<ExecResult> {
  const { cwd, env, files, signal, stdin } = {
    __proto__: null,
    ...options,
  } as typeof options
  const bash = new Bash()
  if (files) {
    const entries = Object.entries(files)
    for (let i = 0, { length } = entries; i < length; i += 1) {
      const entry = entries[i]!
      await bash.fs.writeFile(entry[0], entry[1])
    }
  }
  const execOptions = {
    __proto__: null,
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
    ...(signal ? { signal } : {}),
    ...(stdin !== undefined ? { stdin } : {}),
  } as JustBashExecOptions
  const result = await bash.exec(script, execOptions)
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  }
}

// Run `script` under the chosen backend, normalizing to ExecResult. Defaults to
// the sandbox so an unspecified backend never reaches the host shell. The
// public entry point — most callers use this, not the per-backend functions.
export async function runShell(
  script: string,
  options?: RunShellOptions | undefined,
): Promise<ExecResult> {
  const { backend, cwd, env, files, signal, stdin } = {
    __proto__: null,
    ...options,
  } as RunShellOptions
  if (backend === 'real') {
    return await runReal(script, { cwd, env, signal, stdin })
  }
  return await runSandboxed(script, { cwd, env, files, signal, stdin })
}

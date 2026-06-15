/**
 * @file `skillspectorFromUv()` — locked-uv-project tier of SkillSpector
 *   resolution. Given a uv project dir (a `pyproject.toml` + `uv.lock` that pin
 *   the upstream git SHA + its full transitive closure) and a resolved `uv`
 *   binary, runs `uv sync --locked` to install that exact closure into the
 *   project's `.venv` and returns the `skillspector` entry point. This is the
 *   most locked-down tier — every dependency version is manifested in uv.lock,
 *   and `--locked` hard-fails on lock drift (vs. `from-dlx`'s pip-from-git-SHA
 *   venv, which re-resolves the closure freshly). Returns `undefined` when:
 *
 *   - No project dir / uv binary is supplied (the caller didn't opt in).
 *   - The project files are absent, or `uv sync --locked` fails (lock drift, no
 *     network, missing Python). Idempotent: a second call hits the synced venv
 *     (`uv sync` is a no-op when the venv already matches the lock).
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { uvSyncProject } from '../python/uv-install'

import type { ResolvedSkillSpector } from './types'

export interface SkillSpectorFromUvOptions {
  /**
   * Absolute path to the `uv` executable (typically `resolveUv().path`).
   */
  readonly uvBin: string
  /**
   * Absolute path to the SkillSpector uv project dir (holds `pyproject.toml` +
   * `uv.lock`). The fleet ships this under
   * `setup-security-tools/skillspector/`.
   */
  readonly projectDir: string
}

export async function skillspectorFromUv(
  options: SkillSpectorFromUvOptions,
): Promise<ResolvedSkillSpector | undefined> {
  const opts = { __proto__: null, ...options } as typeof options
  const { projectDir, uvBin } = opts
  if (!projectDir || !uvBin) {
    return undefined
  }
  // A project without its manifest + lock can't be `--locked`-synced.
  if (
    !existsSync(path.join(projectDir, 'pyproject.toml')) ||
    !existsSync(path.join(projectDir, 'uv.lock'))
  ) {
    return undefined
  }
  try {
    await uvSyncProject({ projectDir, uvBin })
  } catch {
    return undefined
  }
  const entry = venvEntryPoint(projectDir)
  if (!existsSync(entry)) {
    return undefined
  }
  return { path: entry, source: 'uv' }
}

// The `uv sync` entry point inside the project venv: POSIX
// `.venv/bin/skillspector`, Windows `.venv/Scripts/skillspector.exe`.
export function venvEntryPoint(projectDir: string): string {
  return process.platform === 'win32'
    ? path.join(projectDir, '.venv', 'Scripts', 'skillspector.exe')
    : path.join(projectDir, '.venv', 'bin', 'skillspector')
}

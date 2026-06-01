/**
 * @file `skillspectorFromDlx()` — DLX-venv tier of SkillSpector resolution.
 *   Creates a single-purpose venv under `~/.socket/_dlx/skillspector/<sha>/`
 *   and pip-installs the pinned git SHA. Returns `undefined` when:
 *
 *   - No Python interpreter is on PATH (host lacks Python 3.12+).
 *   - The venv-create or pip-install command fails.
 *
 *   Idempotent: hits the cached venv when its `skillspector` entry-point
 *   already exists.
 */

import path from 'node:path'

import { getSocketDlxDir } from '../../paths/socket'
import { createPipVenv } from '../from-pip-venv'

import type { ResolvedSkillSpector } from './types'

export interface SkillSpectorFromDlxOptions {
  /**
   * Pinned upstream SHA. Combined with the canonical NVIDIA/skillspector repo
   * URL to form the pip-install spec `git+https://github.com/NVIDIA/skillspector.git@<sha>`.
   */
  readonly sha: string
  /**
   * Cache directory override. Defaults to
   * `getSocketDlxDir() + 'skillspector/<sha>'`. Tests pass a tmpdir.
   */
  readonly cacheDir?: string | undefined
}

const UPSTREAM_REPO = 'https://github.com/NVIDIA/skillspector.git'

export async function skillspectorFromDlx(
  opts: SkillSpectorFromDlxOptions,
): Promise<ResolvedSkillSpector | undefined> {
  const { sha } = opts
  if (!sha) {
    return undefined
  }
  const cacheDir =
    opts.cacheDir ?? path.join(getSocketDlxDir(), 'skillspector', sha)
  const installSpec = `git+${UPSTREAM_REPO}@${sha}`

  try {
    const result = await createPipVenv({
      cacheDir,
      entryPoint: 'skillspector',
      installSpec,
    })
    return { path: result.entryPointPath, source: 'dlx' }
  } catch {
    return undefined
  }
}

/**
 * @file `skillspectorFromPath()` — `which skillspector` lookup. Reports
 *   `source: 'pipx'` when the resolved path lives under a `pipx/venvs/`
 *   directory (the dev's `pipx install skillspector` path); reports `source:
 *   'path'` otherwise (a one-off binary on PATH).
 */

import { which } from '../../bin/which'
import { normalizePath } from '../../paths/normalize'

import type { ResolvedSkillSpector } from './types'

// pipx puts venvs under either:
//   ~/.local/pipx/venvs/<pkg>/bin/<entry-point>           (linux/macOS)
//   ~/.local/share/pipx/venvs/<pkg>/bin/<entry-point>     (XDG)
//   %USERPROFILE%\pipx\venvs\<pkg>\Scripts\<entry-point>  (windows)
// Match against the forward-slash form only — normalizePath drops
// the Windows backslash variant so the regex stays single-shape.
const PIPX_PATH_SEGMENT_RE = /pipx\/venvs\//

export async function skillspectorFromPath(): Promise<
  ResolvedSkillSpector | undefined
> {
  const resolved = await which('skillspector', { nothrow: true })
  if (typeof resolved !== 'string') {
    return undefined
  }
  const normalized = normalizePath(resolved)
  if (PIPX_PATH_SEGMENT_RE.test(normalized)) {
    return { path: normalized, source: 'pipx' }
  }
  return { path: normalized, source: 'path' }
}

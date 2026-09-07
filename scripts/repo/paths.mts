import path from 'node:path'
import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import { REPO_ROOT } from '../fleet/paths.mts'

export const DIST_EXTERNAL_DIR = normalizePath(
  path.join(REPO_ROOT, 'dist', 'external'),
)
export const SRC_EXTERNAL_DIR = normalizePath(
  path.join(REPO_ROOT, 'src', 'external'),
)

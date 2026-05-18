/**
 * @file `detectFormat(filename)` — maps a filename (or path) to its
 *   `FormatDescriptor` (ecosystem + manifest/lockfile + lockfile format), or
 *   returns `undefined` if nothing matched. On socket-btm's smol Node binary
 *   this routes to `node:smol-manifest`'s native `detectFormat`; on stock Node
 *   it does a basename switch over the format descriptors exported by each
 *   PM-specific dir under `src/eco/<eco>/<pm>/`. The two paths return
 *   byte-equivalent shapes so the swap is invisible. `supportedFiles` is
 *   exported alongside for callers that want to enumerate the recognized
 *   filenames (e.g. for file-globbing).
 */

import {
  CARGO_LOCK_FILENAME,
  CARGO_LOCK_FORMAT,
} from '../cargo/lockfile-format'
import {
  CARGO_TOML_FILENAME,
  CARGO_TOML_FORMAT,
} from '../cargo/manifest-format'
import {
  PACKAGE_JSON_FILENAME,
  PACKAGE_JSON_FORMAT,
} from '../npm/manifest-format'
import {
  PACKAGE_LOCK_FILENAMES,
  PACKAGE_LOCK_FORMAT,
} from '../npm/npm/lockfile-format'
import {
  PNPM_LOCK_FILENAME,
  PNPM_LOCK_FORMAT,
} from '../npm/pnpm/lockfile-format'
import {
  YARN_LOCK_FILENAME,
  YARN_LOCK_FORMAT,
} from '../npm/yarnpkg/yarn/lockfile-format'
import { ObjectFreeze } from '../../primordials/object'
import { getSmolManifest } from '../../smol/manifest'

import {
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
} from '../../primordials/string'

import type { FormatDescriptor, SupportedFiles } from './types'

// Composer descriptors stay inline until `src/eco/composer/` exists.
const COMPOSER_JSON_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'composer',
  type: 'manifest',
}) as unknown as FormatDescriptor

const COMPOSER_LOCK_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'composer',
  format: 'composer',
  type: 'lockfile',
}) as unknown as FormatDescriptor

const MANIFEST_NAMES = ObjectFreeze([
  PACKAGE_JSON_FILENAME,
  CARGO_TOML_FILENAME,
  'composer.json',
])

const LOCKFILE_NAMES = ObjectFreeze([
  ...PACKAGE_LOCK_FILENAMES,
  YARN_LOCK_FILENAME,
  PNPM_LOCK_FILENAME,
  CARGO_LOCK_FILENAME,
  'composer.lock',
])

const _jsSupportedFiles: SupportedFiles = ObjectFreeze({
  __proto__: null,
  manifests: MANIFEST_NAMES,
  lockfiles: LOCKFILE_NAMES,
}) as unknown as SupportedFiles

export function jsDetectFormat(filename: string): FormatDescriptor | undefined {
  const lastSlash = StringPrototypeLastIndexOf(filename, '/')
  const basename =
    lastSlash === -1 ? filename : StringPrototypeSlice(filename, lastSlash + 1)
  switch (basename) {
    case PACKAGE_JSON_FILENAME:
      return PACKAGE_JSON_FORMAT
    case CARGO_TOML_FILENAME:
      return CARGO_TOML_FORMAT
    case 'composer.json':
      return COMPOSER_JSON_FORMAT
    case 'package-lock.json':
    case 'npm-shrinkwrap.json':
      return PACKAGE_LOCK_FORMAT
    case YARN_LOCK_FILENAME:
      return YARN_LOCK_FORMAT
    case PNPM_LOCK_FILENAME:
      return PNPM_LOCK_FORMAT
    case CARGO_LOCK_FILENAME:
      return CARGO_LOCK_FORMAT
    case 'composer.lock':
      return COMPOSER_LOCK_FORMAT
    default:
      return undefined
  }
}

const _smol = getSmolManifest()

export const detectFormat: (filename: string) => FormatDescriptor | undefined =
  _smol?.detectFormat ?? jsDetectFormat

export const supportedFiles: SupportedFiles =
  _smol?.supportedFiles ?? _jsSupportedFiles

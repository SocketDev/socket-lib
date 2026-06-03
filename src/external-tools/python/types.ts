/**
 * @file Types for the python-build-standalone DLX resolver. A "resolved python"
 *   is an absolute path to a CPython interpreter plus the tier that found it.
 */

import type { ResolvedToolIntegrity } from '../from-download'

/**
 * Which resolver tier produced the interpreter.
 *
 * - `path`     — an interpreter already on PATH (system / pyenv / etc.).
 * - `download` — a python-build-standalone CPython fetched into the DLX cache.
 */
export type PythonSource = 'download' | 'path'

export interface ResolvedPython {
  /**
   * Absolute path to the `python3` (or `python.exe`) executable.
   */
  readonly path: string
  /**
   * Which resolver tier found this interpreter.
   */
  readonly source: PythonSource
  /**
   * SRI integrity of the downloaded archive. Set only when
   * `source === 'download'`; the PATH tier references an interpreter already on
   * disk and computes no hash. See {@link ResolvedToolIntegrity}.
   */
  readonly integrity?: ResolvedToolIntegrity | undefined
}

/**
 * Pin describing which python-build-standalone build to fetch. The caller
 * supplies these from its own `external-tools.json` (or `bundle-tools.json`) —
 * the library does not embed a default version, so each consumer controls its
 * own pin + soak.
 */
export interface PythonBuildPin {
  /**
   * CPython version, e.g. `3.11.14`.
   */
  readonly version: string
  /**
   * python-build-standalone release tag, e.g. `20260203`.
   */
  readonly tag: string
  /**
   * Optional per-platform integrity (hex SHA-256 or SRI). Keyed by the asset
   * filename so the resolver can verify the exact tarball it downloads.
   */
  readonly integrity?: string | undefined
}

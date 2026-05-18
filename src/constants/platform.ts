/**
 * @file Platform detection and OS-specific constants.
 */

import { getNodeOs } from '../node/os'

/**
 * CPU architecture type.
 */
export type Arch = NodeJS.Architecture

/**
 * Linux libc variant.
 */
export type Libc = 'glibc' | 'musl'

/**
 * Operating system platform type.
 */
export type Platform = NodeJS.Platform

let _arch: Arch | undefined

/**
 * Get the current CPU architecture (memoized).
 */
export function getArch(): Arch {
  if (_arch === undefined) {
    _arch = getNodeOs().arch()
  }
  return _arch
}

let _platform: Platform | undefined

/**
 * Get the current platform (memoized).
 */
export function getPlatform(): Platform {
  if (_platform === undefined) {
    _platform = getNodeOs().platform()
  }
  return _platform
}

// Platform detection (memoized at module load).
export const DARWIN = getPlatform() === 'darwin'
export const WIN32 = getPlatform() === 'win32'

// File permission modes.
export const S_IXUSR = 0o100
export const S_IXGRP = 0o010
export const S_IXOTH = 0o001

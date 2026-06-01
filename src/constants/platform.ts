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

let memoizedArch: Arch | undefined

/**
 * Get the current CPU architecture (memoized).
 */
export function getArch(): Arch {
  if (memoizedArch === undefined) {
    memoizedArch = getNodeOs().arch()
  }
  return memoizedArch
}

let memoizedPlatform: Platform | undefined

/**
 * Get the current platform (memoized).
 */
export function getPlatform(): Platform {
  if (memoizedPlatform === undefined) {
    memoizedPlatform = getNodeOs().platform()
  }
  return memoizedPlatform
}

// Platform detection (memoized at module load).
export const DARWIN = getPlatform() === 'darwin'
export const WIN32 = getPlatform() === 'win32'

// File permission modes.
export const S_IXUSR = 0o100
export const S_IXGRP = 0o010
export const S_IXOTH = 0o001

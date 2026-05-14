/**
 * @fileoverview `getCurrentPlatformArch()` — resolves the current
 * machine to a `platform-arch` string suitable for the Adoptium
 * asset-name map. Wraps `getPlatformArch` from `src/releases/socket-btm`
 * so external-tools modules don't need to know about releases'
 * platform/arch typing.
 *
 * Returns `undefined` on unsupported platform/arch combos.
 */

import process from 'node:process'

import { detectLibc, getPlatformArch } from '../../releases/socket-btm'

import type { Arch, Platform } from '../../releases/socket-btm'

export function getCurrentPlatformArch(): string | undefined {
  /* c8 ignore start - depends on process.platform/arch. */
  try {
    return getPlatformArch(
      process.platform as Platform,
      process.arch as Arch,
      detectLibc(),
    )
  } catch {
    return undefined
  }
  /* c8 ignore stop */
}

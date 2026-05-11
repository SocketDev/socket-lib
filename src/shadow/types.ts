/**
 * @fileoverview Public type surface for `shadow/*` modules — the
 * `ShadowInstallationOptions` record. Pure types, no runtime side
 * effects.
 */

export interface ShadowInstallationOptions {
  cwd?: string | undefined
  win32?: boolean | undefined
}

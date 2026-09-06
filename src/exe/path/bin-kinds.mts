/**
 * @file Name and extension predicates shared by the binary-resolution modules.
 *   Each one answers a single question about a bin path's basename or lowered
 *   extension. They live here so `resolve.mts`, `resolve-volta.mts` and
 *   `resolve-shims.mts` all branch on the same spelling of "is this npm" rather
 *   than three hand-copied comparisons that can drift apart.
 */

/**
 * Whether a lowered extension is one the wrapper-script parsers understand:
 * extensionless shell scripts, `.cmd` batch files, `.exe` binaries, and `.ps1`
 * PowerShell scripts. Anything else is left untouched.
 */
export function isKnownShimExtension(extLowered: string): boolean {
  return (
    extLowered === '' ||
    extLowered === '.cmd' ||
    extLowered === '.exe' ||
    extLowered === '.ps1'
  )
}

/**
 * Whether a basename names the Node binary itself.
 *
 * Lowercased because Windows paths are case-insensitive, so `NODE.EXE` names
 * the same binary as `node.exe`. The extension is stripped by the caller's
 * `path.basename(p, ext)`, so only the case needs handling here.
 */
export function isNodeBinName(basename: string): boolean {
  return basename.toLowerCase() === 'node'
}

/**
 * Whether a basename names npm or npx. The npm CLI build generates both
 * wrappers from one template, so a single parser reads either.
 */
export function isNpmOrNpxBin(basename: string): boolean {
  // oxlint-disable-next-line socket/no-npx-dlx -- executable name
  return basename === 'npm' || basename === 'npx'
}

/**
 * Whether a basename names pnpm or yarn.
 *
 * This groups two basenames by the SHAPE OF THEIR WRAPPER SCRIPTS, not by any
 * kinship between the tools. `yarn` alone spans three unrelated package
 * managers — yarn classic, yarn berry, and zpm — that differ in resolver,
 * lockfile and layout. What they share with pnpm is only that their shims are
 * emitted in `$basedir`/`%~dp0` form by an installer rather than by the npm
 * CLI build, so the same parse order applies before falling back to cmd-shim.
 */
export function isPnpmOrYarnBin(basename: string): boolean {
  return basename === 'pnpm' || basename === 'yarn'
}

/**
 * @file Which wrapper format a binary's shim uses, and the extension/name
 *   predicates the resolvers share.
 *   A binary on PATH is usually a generated wrapper rather than the real
 *   script, and there are three formats in circulation. Dispatching on the
 *   FORMAT rather than on a list of tool names is what keeps this table open:
 *   a new package manager is one row, not a renamed predicate and not another
 *   `||` branch threaded through every call site.
 */

/**
 * The wrapper formats the shim parsers understand.
 *
 * - `npmCli` — emitted by the npm CLI's own build, which assigns the target to an
 *   `NPM_CLI_JS` / `NPX_CLI_JS` shell variable.
 * - `installer` — emitted by a manager's own installer or setup action, in
 *   `"$basedir/..."` / `"%~dp0\..."` form. Bodies vary by install method, so
 *   several patterns are tried in order.
 * - `cmdShim` — the npm ecosystem's standard `cmd-shim` output, used for every
 *   package binary that does not ship a bespoke wrapper.
 */
export const BIN_SHIM_FORMAT = {
  cmdShim: 'cmd-shim',
  installer: 'installer',
  npmCli: 'npm-cli',
} as const

/**
 * One of the wrapper formats named by `BIN_SHIM_FORMAT`.
 */
export type BinShimFormat =
  (typeof BIN_SHIM_FORMAT)[keyof typeof BIN_SHIM_FORMAT]

/**
 * Basenames whose wrapper is NOT standard `cmd-shim` output.
 *
 * Only entries whose emitted wrapper body has actually been observed belong
 * here. Guessing a manager's format is worse than omitting it: an entry sends
 * the shim down a parser built for a different body, which returns a plausible
 * but wrong path instead of failing. Omission is safe — an absent name falls
 * to `cmdShim`, which is what the ecosystem's installers emit by default.
 *
 * `yarn` is one basename covering three unrelated managers — classic, berry
 * and zpm. It sits here because all three are installer-emitted, not because
 * they share anything else.
 */
const BIN_SHIM_FORMAT_BY_BIN: ReadonlyMap<string, BinShimFormat> = new Map([
  ['npm', BIN_SHIM_FORMAT.npmCli],
  // oxlint-disable-next-line socket/no-npx-dlx -- executable name
  ['npx', BIN_SHIM_FORMAT.npmCli],
  ['pnpm', BIN_SHIM_FORMAT.installer],
  ['yarn', BIN_SHIM_FORMAT.installer],
])

/**
 * The wrapper format for a binary's basename.
 *
 * An unrecognized name answers `BIN_SHIM_FORMAT.cmdShim`, the ecosystem
 * default. That is why a manager this table has never heard of still resolves
 * correctly, so long as its installer emits a standard shim.
 */
export function binShimFormat(basename: string): BinShimFormat {
  return BIN_SHIM_FORMAT_BY_BIN.get(basename) ?? BIN_SHIM_FORMAT.cmdShim
}

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

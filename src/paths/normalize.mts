/**
 * @file The public `paths/normalize` surface. Every name here is DEFINED in a
 *   sibling leaf and re-exported, so this file imports the `paths/*` graph and
 *   nothing in that graph imports back. That direction is the whole point. When
 *   `normalizePath` lived here, the three leaves that call it had to import
 *   this file, and this file imported them back for the re-exports below. The
 *   built CJS emits a re-export as an eager `exports.isPath =
 *   require_paths_predicates.isPath`, so loading `paths/predicates` first left
 *   nine of these bindings pinned to `undefined` for the life of the process.
 *   The implementations moved down to `paths/shared`, the true leaf, and the
 *   cycle went away. Keep this file re-export-only.
 *   `scripts/repo/check/reexports-have-no-import-cycles.mts` fails the build if
 *   any `paths/*` leaf imports it back.
 */

export {
  fromUnixPath,
  splitPath,
  toUnixPath,
  trimLeadingDotSlash,
} from './conversion.mjs'
export {
  isAbsolute,
  isNodeModules,
  isPath,
  isPathSeparator,
  isRelative,
  isSeparatorWrapped,
  isUnixPath,
  isWindowsDeviceRoot,
  separatorWrappedSubstring,
} from './predicates.mjs'
export { relative, relativeResolve, resolve } from './resolve.mjs'
export {
  foldPathForCompare,
  msysDriveToNative,
  normalizePath,
  pathLikeToString,
} from './shared.mjs'

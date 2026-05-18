/**
 * @file Shared types for manifest + lockfile parsing. These types are the
 *   contract every parser in `src/eco/<pm>/parse-*` and every consumer of
 *   `src/eco/manifest/*` agrees on. The smol binding (`src/smol/manifest.ts`)
 *   re-exports the same shapes from its own surface so the smol-vs-JS swap is
 *   invisible to callers. Shapes are intentionally `readonly` end-to-end —
 *   parsers freeze their output with `Object.freeze({ __proto__: null, … })` to
 *   match the smol implementation, and consumers must not mutate.
 */

export type {
  DepType,
  FormatDescriptor,
  LockfileStats,
  ManifestDep,
  ManifestErrorLike,
  PackageRef,
  ParsedLockfile,
  ParsedManifest,
  SupportedFiles,
} from '../../smol/manifest'

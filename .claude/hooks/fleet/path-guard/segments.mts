// Canonical path-segment vocabulary shared by the path-guard hook
// (.claude/hooks/fleet/path-guard/index.mts) and gate (scripts/fleet/check/paths.mts).
//
// Mantra: 1 path, 1 reference. This module is the *one* place stage,
// build-root, mode, and sibling-package vocabulary is defined. Both
// consumers import from here so they can never drift apart.
//
// Synced byte-identically across the Socket fleet via
// socket-wheelhouse/scripts/sync-scaffolding.mts (IDENTICAL_FILES).
// When adding a new stage/build-root/mode/sibling, edit this file in
// the template and re-sync.

// "Stage" segments — Rule A core. Two of these spread via `path.join`
// or interpolated into a template literal is a finding outside a
// canonical `paths.mts`. Sourced from build-infra/lib/constants.mts
// `BUILD_STAGES` plus their lowercase directory-name siblings used by
// some builders.
export const STAGE_SEGMENTS = new Set([
  'Compressed',
  'Final',
  'Optimized',
  'Release',
  'Stripped',
  'Synced',
  'downloaded',
  'wasm',
])

// "Build-root" segments — at least one must be present together with
// a stage segment to confirm we're constructing a build output path
// rather than something coincidental. Example: a join that yields
// `<root>/<stage>/<lib>` doesn't fire if no build-root segment is
// present; `<root>/build/<stage>/out/<stage>` does.
export const BUILD_ROOT_SEGMENTS = new Set(['build', 'out'])

// Build-mode segments — a stage segment plus one of these is also a
// finding (`build/<mode>/<arch>/out/<stage>` is the canonical shape).
export const MODE_SEGMENTS = new Set(['dev', 'prod', 'shared'])

// Module-anchor identifiers (Rule H). A `path.join`/`path.resolve` whose
// first argument is one of these AND whose remaining arguments are all `'..'`
// is walking up from the module's own location to reach the repo root by a
// hardcoded count — exactly the fragile pattern that broke when 73c691d9
// moved scripts a directory deeper and left the `..`-counts stale. Repo root
// must come from the single `REPO_ROOT` owner in `paths.mts`, never a count.
// `__dirname` is a true keyword (always an anchor); `here` is the fleet's
// conventional name for `path.dirname(fileURLToPath(import.meta.url))` and is
// only treated as an anchor when that binding is present in the same file
// (verified by the detector — the bare name is too common to assume).
export const REPO_ROOT_ANCHOR_IDENTIFIERS = new Set(['__dirname', 'here'])

// Sibling fleet packages (Rule B). Union of all packages across the
// Socket fleet — the gate is byte-identical via sync-scaffolding, so
// listing every fleet package keeps Rule B firing in any repo. When a
// new package joins the workspace, add it here and propagate via
// `node scripts/sync-scaffolding.mts --all --fix` from
// socket-wheelhouse.
export const KNOWN_SIBLING_PACKAGES = new Set([
  'acorn',
  'bin-infra',
  'binflate',
  'binject',
  'binpress',
  'build-infra',
  'cli',
  'codet5-models-builder',
  'core',
  'curl-builder',
  'libpq-builder',
  'lief-builder',
  'minilm-builder',
  'models',
  'napi-go',
  'node-smol-builder',
  'npm',
  'onnxruntime-builder',
  'opentui-builder',
  'package-builder',
  'react',
  'renderer',
  'stubs-builder',
  'ultraviolet',
  'ultraviolet-builder',
  'yoga',
  'yoga-layout-builder',
])

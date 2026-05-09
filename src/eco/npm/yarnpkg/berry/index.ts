/**
 * @fileoverview Yarn Berry (v2-v5) tool surface.
 *
 * Repo: https://github.com/yarnpkg/berry
 *
 * Currently delegates to the yarnpkg/yarn (Classic) implementation —
 * Berry inherits the Classic CLI shape closely enough that the same
 * exec function works for `yarn install`, `yarn add`, etc. Diverges
 * from Classic in:
 *   - `--immutable` replaces `--frozen-lockfile`
 *   - `yarn dlx <pkg>` (no Classic equivalent; Classic uses `npx`)
 *   - workspace-protocol resolution semantics
 *
 * When a caller needs Berry-specific behavior, override here rather
 * than branching inside yarnpkg/yarn. The dir is pre-canonical so
 * eco/npm/yarnpkg/berry/ exists for downstream code to import from.
 */

export { execYarn } from '../yarn/exec'

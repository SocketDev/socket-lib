/**
 * @fileoverview ZPM (Yarn 6+, Rust rewrite at yarnpkg/zpm) tool surface.
 *
 * Repo: https://github.com/yarnpkg/zpm
 *
 * "This repository contains the sources for Yarn version 6 and above."
 * Versioning skipped from Berry v4 to ZPM v6 — there is no v5. ZPM uses
 * a JSON-based lockfile (yarn.lock starting with `{`, `__metadata.version`
 * >= 9, "entries" key). Detection lives in
 * socket-sdxgen/src/parsers/zpm/.
 *
 * CLI shape currently mirrors Berry/Classic enough that execYarn from
 * yarnpkg/yarn works. ZPM's distinctive features (workspace islands,
 * @builtin:/@workspace:/@patch: protocols) surface as data-format
 * differences in the lockfile, not as CLI flag changes that affect
 * how we invoke the binary.
 *
 * When ZPM-specific exec behavior diverges, override here.
 */

export { execYarn } from '../yarn/exec'

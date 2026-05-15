/**
 * @fileoverview Public aggregator for the `Temporal` surface.
 *
 * Importing `* as Temporal` from this module yields a namespace shape
 * matching the TC39 global: `Temporal.Now`, `Temporal.Instant`, etc.
 * This is the **single permitted barrel** in `socket-lib/temporal/` —
 * it has no logic of its own, only re-exports, and it exists because
 * the spec's public API is namespace-shaped and consumers would
 * otherwise need one import per namespace.
 *
 * Pinned spec rev:    tc39/proposal-temporal@4df4199 (2026-05-11)
 * Pinned ref impl:    js-temporal/temporal-polyfill@52dcc4c (2026-04-22)
 * Layout, recipe, and policy: see README.md in this folder.
 *
 * Usage:
 *   import * as Temporal from '@socketsecurity/lib/temporal'
 *   const now = Temporal.Now.instant()
 *   const ns  = now.epochNanoseconds
 *
 * Surface available in pass 1:
 *   - Temporal.Now.instant ( )
 *   - Temporal.Instant (constructor)
 *   - Temporal.Instant.prototype.epochNanoseconds (getter)
 *
 * Reaching for a namespace not re-exported below (e.g.
 * `Temporal.PlainDate`) is a TypeScript error at the import site.
 * Add new surface deliberately per the recipe in README.md.
 */

export * as Now from './now'
export { Instant } from './instant'

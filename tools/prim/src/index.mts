/**
 * @fileoverview Public surface for the prim audit toolkit.
 *
 * Most consumers want the CLI (`prim`); this module exists for
 * programmatic callers that want to compose audits into their own
 * tooling — e.g. running an audit inside a release-gate script and
 * acting on the structured findings.
 */

export { auditDirectory } from './audit.mts'
export { lintSource } from './lint.mts'
export { loadPrimordialsSurface } from './surface.mts'
export {
  TRACKED_GLOBALS,
  ctorPrimordialName,
  guessReceiverType,
  prototypePrimordialName,
  staticPrimordialName,
} from './globals.mts'

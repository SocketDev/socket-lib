/**
 * @fileoverview Public surface for the prim audit toolkit.
 *
 * Most consumers want the CLI (`prim`); this module exists for
 * programmatic callers that want to compose audits into their own
 * tooling — e.g. running an audit inside a release-gate script and
 * acting on the structured findings.
 */

export { auditDirectory } from './audit.mts'
export { applyCodemod } from './codemod.mts'
export { lintSource } from './lint.mts'
export { loadPrimordialsSurface } from './surface.mts'
export {
  INTENTIONAL_NON_PRIMORDIAL_STATICS,
  NODE_MODULE_STATIC_METHODS,
  TRACKED_GLOBALS,
  TYPE_NARROWING_STATIC_CALLS,
  ctorPrimordialName,
  guessReceiverType,
  prototypePrimordialName,
  staticPrimordialName,
} from './globals.mts'

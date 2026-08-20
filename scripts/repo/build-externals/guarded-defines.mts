/*
 * @file The externals-build define map, in its own module so a consumer that
 *   only needs the CONSTANT does not load the guarded-define plugin beside it.
 *   That plugin is a fleet file delivered by the release bundle, so a member
 *   whose bundle predates it cannot import this module's neighbor at all —
 *   which is how a test asserting the define map came to fail on a missing
 *   plugin.
 */

/**
 * The guarded define substitutions every external build applies. Exported so
 * the regression test can assert no bare identifier here shadows a REAL
 * runtime global — substituting one turns a dep's correct feature detection
 * into a `(void 0).x` crash (Node 21 promoted `navigator`, Node 22
 * `WebSocket`, Node 26 `localStorage`/`sessionStorage`; picomatch's
 * isWindows hit the navigator one in 6.5.0). Only identifiers Node does not
 * define belong here.
 */
export const GUARDED_DEFINES: Record<string, string> = {
  __DEV__: 'false',
  __JEST__: 'false',
  __MOCHA__: 'false',
  __TEST__: 'false',
  document: 'undefined',
  'global.GENTLY': 'false',
  HTMLElement: 'undefined',
  'process.browser': 'false',
  'process.env.CI': 'false',
  'process.env.DEBUG': 'undefined',
  'process.env.JEST_WORKER_ID': 'undefined',
  'process.env.NODE_ENV': '"production"',
  'process.env.NODE_TEST': 'undefined',
  'process.env.VERBOSE': 'false',
  window: 'undefined',
  XMLHttpRequest: 'undefined',
}

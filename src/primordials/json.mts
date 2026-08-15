/**
 * @file Safe references to `JSON.parse` / `JSON.stringify`. Captured at module
 *   load so prototype-pollution attacks (e.g. monkey-patching `JSON.parse` to
 *   leak the parsed payload) can't redirect callers that route through these
 *   references.
 */

export const JSONParse = JSON.parse
export const JSONStringify = JSON.stringify

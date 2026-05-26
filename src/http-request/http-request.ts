/**
 * @file Public HTTP-request entry — re-exports the platform-correct
 *   implementation. Bundlers that honor the package.json `'browser'` condition
 *   (rolldown, vite, esbuild on browser platform) swap this entry to
 *   `./browser`; Node consumers get `./node`. Same named exports (`httpJson`,
 *   `httpText`, `httpRequest`, `HttpResponseError`) on both platforms so
 *   callers can write `import { httpJson } from
 *   '@socketsecurity/lib/http-request/http-request'` without caring about
 *   platform.
 */

export { httpJson, httpRequest, httpText, HttpResponseError } from './node'
export type { HttpResponse, HttpRequestOptions } from './node'

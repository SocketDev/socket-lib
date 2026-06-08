/// <reference lib="dom" />

/**
 * @file Thin wrapper over the global `fetch()` so tests can mock the network
 *   layer via `vi.mock('@socketsecurity/lib/http-request/fetch/browser')`
 *   without monkey-patching `globalThis.fetch` (which conflicts with the
 *   project's nock-based test setup). The wrapper itself is `c8 ignore`-marked
 *   because the body is a single uncoverable fetch call; coverage credit is
 *   preserved by the wider test suite that mocks this module and asserts the
 *   call shape.
 */

/* c8 ignore start - native fetch call; tests mock this module wholesale */
export function fetchResponse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // oxlint-disable-next-line socket/no-fetch-prefer-http-request -- browser entrypoint; fetch IS the underlying API
  return fetch(input, init)
}
/* c8 ignore stop */

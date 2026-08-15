/**
 * @file Private lazy loaders for the Node.js modules used by the
 *   `http-request/*` leaves. The `shared.ts` filename keeps this module out of
 *   the generated package.json `exports` map (the `dist/**\/shared.*` ignore
 *   pattern in `scripts/repo/package-exports.config.mts` filters it out), so it
 *   is not part of the public surface — it exists only as a re-export shim so
 *   existing siblings keep working unchanged. New code should import the
 *   canonical helpers directly:
 *
 *   - `getNodeCrypto` from `@socketsecurity/lib/node/crypto`
 *   - `getNodeFs` from `@socketsecurity/lib/node/fs`
 *   - `getNodeHttp` from `@socketsecurity/lib/node/http`
 *   - `getNodeHttps` from `@socketsecurity/lib/node/https`
 */

export { getNodeCrypto as getCrypto } from '../node/crypto.mjs'
export { getNodeFs as getFs } from '../node/fs.mjs'
export { getNodeHttp as getHttp } from '../node/http.mjs'
export { getNodeHttps as getHttps } from '../node/https.mjs'

/**
 * @file Private lazy loaders for the Node.js modules used by the
 *   `http-request/*` leaves. The `_` prefix keeps this module out of the
 *   generated package.json `exports` map (the `dist/**\/_*` ignore pattern in
 *   `scripts/post-build/make-package-exports.mts` filters it out), so it is not
 *   part of the public surface — it exists only as a re-export shim so existing
 *   siblings keep working unchanged. New code should import the canonical
 *   helpers directly:
 *
 *   - `getNodeCrypto` from `@socketsecurity/lib/node/crypto`
 *   - `getNodeFs` from `@socketsecurity/lib/node/fs`
 *   - `getNodeHttp` from `@socketsecurity/lib/node/http`
 *   - `getNodeHttps` from `@socketsecurity/lib/node/https`
 */

export { getNodeCrypto as getCrypto } from '../node/crypto'
export { getNodeFs as getFs } from '../node/fs'
export { getNodeHttp as getHttp } from '../node/http'
export { getNodeHttps as getHttps } from '../node/https'

/**
 * @file Shared types for the browser-safe OCI distribution-spec pull client.
 *   The HTTP surface is an INJECTABLE adapter (`OciHttpAdapter`) so the client
 *   has no `node:*` dependency at module load. Node callers build the adapter
 *   from `@socketsecurity/lib/http-request` (`{ json: httpJson, request:
 *   httpRequest }`); browser callers pass the `http-request/browser`
 *   equivalents. The `request` leg is needed on top of `json` because the OCI
 *   flow reads the `WWW-Authenticate` challenge header on the `/v2/` probe, the
 *   `Docker-Content-Digest` header on a manifest, and the raw bytes of a blob —
 *   none of which a JSON-only adapter exposes.
 */

/**
 * The subset of an HTTP response the OCI client reads. A Node `HttpResponse`
 * from `@socketsecurity/lib/http-request` satisfies this shape directly.
 */
export interface OciHttpResponse {
  arrayBuffer(): ArrayBuffer
  headers: Record<string, string | string[] | undefined>
  json<T = unknown>(): T
  ok: boolean
  status: number
  statusText: string
  text(): string
}

/**
 * Per-request options passed through the adapter. Only headers are needed for
 * the anonymous pull flow (bearer token + media-type Accept).
 */
export interface OciRequestOptions {
  headers?: Record<string, string> | undefined
}

/**
 * Injectable HTTP adapter. `json` parses a JSON endpoint such as a token or
 * config blob; `request` returns the full response so the caller can read
 * headers and bytes.
 */
export interface OciHttpAdapter {
  json<T = unknown>(
    url: string,
    options?: OciRequestOptions | undefined,
  ): Promise<T>
  request(
    url: string,
    options?: OciRequestOptions | undefined,
  ): Promise<OciHttpResponse>
}

/**
 * The `{ http }` bag every OCI client function accepts, mirroring the npm
 * registry client's `NpmHttpOptions`.
 */
export interface OciHttpOptions {
  http: OciHttpAdapter
}

/**
 * A parsed `WWW-Authenticate: Bearer realm=...,service=...,scope=...`
 * challenge.
 */
export interface AuthChallenge {
  realm: string
  scope: string | undefined
  service: string | undefined
}

/**
 * The token endpoint's JSON response. Registries return the bearer under
 * `token` (Docker) or `access_token` (OAuth-style); both are accepted.
 */
export interface OciTokenResponse {
  access_token?: string | undefined
  token?: string | undefined
}

/**
 * A platform descriptor on a manifest-index entry.
 */
export interface OciPlatform {
  architecture?: string | undefined
  os?: string | undefined
  variant?: string | undefined
}

/**
 * An OCI content descriptor for a config, layer, or index entry.
 */
export interface OciDescriptor {
  digest?: string | undefined
  mediaType?: string | undefined
  platform?: OciPlatform | undefined
  size?: number | undefined
}

/**
 * A parsed image manifest or manifest index. `config` + `layers` are present on
 * a single image manifest; `manifests` is present on a multi-arch index.
 */
export interface OciManifest {
  config?: OciDescriptor | undefined
  layers?: OciDescriptor[] | undefined
  manifests?: OciDescriptor[] | undefined
  mediaType?: string | undefined
  schemaVersion?: number | undefined
}

/**
 * The result of fetching a manifest: the parsed body, its canonical
 * `Docker-Content-Digest`, and the served media type.
 */
export interface OciManifestResult {
  digest: string
  manifest: OciManifest
  mediaType: string | undefined
}

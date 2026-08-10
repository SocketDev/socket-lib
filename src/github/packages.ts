/**
 * @file Build GitHub Packages REST paths for container packages. This is the
 *   Packages API on api.github.com (`/orgs/{org}/packages/container/{name}`),
 *   not the OCI registry API that `oci/registry` speaks - the two describe the
 *   same artifact through different surfaces, and only this one needs the
 *   package name percent-encoded into a single path segment.
 *   A nested package name such as `my-repo/my-pack` carries a slash that must
 *   arrive as `%2F`, because a raw slash would split into an extra path segment
 *   and the request would 404. `encodeURIComponent` escapes every slash;
 *   `name.replace('/', '%2F')` escapes only the first one, which is the bug
 *   these helpers exist to make unrepeatable.
 */

/**
 * The `per_page` the versions listing uses when a caller does not choose one.
 */
export const CONTAINER_VERSIONS_PER_PAGE = 100

/**
 * A container package name encoded for use as ONE REST path segment.
 *
 * Safe for a nested name: every slash becomes `%2F`, so the result never adds a
 * path segment no matter how deeply the package is nested.
 */
export function containerPackagePath(name: string): string {
  return encodeURIComponent(name)
}

/**
 * The browser URL of a container package's settings page, where its visibility
 * is changed. A package API path will not do here: this is the page a human
 * opens, so it is github.com rather than api.github.com.
 */
export function containerSettingsUrl(owner: string, name: string): string {
  return `https://github.com/orgs/${encodeURIComponent(owner)}/packages/container/${containerPackagePath(name)}/settings`
}

/**
 * The versions-listing path for an org's container package, newest first.
 */
export function containerVersionsPath(
  owner: string,
  name: string,
  perPage?: number | undefined,
): string {
  const size = perPage ?? CONTAINER_VERSIONS_PER_PAGE
  return `/orgs/${encodeURIComponent(owner)}/packages/container/${containerPackagePath(name)}/versions?per_page=${size}`
}

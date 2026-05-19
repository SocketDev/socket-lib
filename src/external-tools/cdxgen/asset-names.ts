/**
 * @file Upstream cdxgen package coordinates. Unlike GitHub-release tools (jre,
 *   uv, trivy, etc.), cdxgen ships exclusively as an npm package — no
 *   per-platform binaries — so the "asset" surface is just the package spec.
 *   The resolver hands it to `dlx/package` which delegates to npm's resolver.
 */

export interface CdxgenPackageOptions {
  /**
   * Cdxgen release version, e.g. `'12.0.0'`. Bare semver; npm accepts it
   * verbatim as `@cyclonedx/cdxgen@<version>`.
   */
  version: string
}

/**
 * Build the npm package spec string for the requested cdxgen version. Always
 * returns a defined value — cdxgen has no per-platform fan-out, so there's no
 * `undefined`-on-unsupported case the way GitHub-asset tools have.
 */
export function getCdxgenPackageSpec(opts: CdxgenPackageOptions): string {
  return `@cyclonedx/cdxgen@${opts.version}`
}

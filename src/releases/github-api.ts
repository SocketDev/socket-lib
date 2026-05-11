/**
 * @fileoverview GitHub release API barrel — re-exports the split
 * listing + asset-url leaves so existing `releases/github-api`
 * importers keep working unchanged.
 *
 *   - list all releases for a repo — `./github-listing`
 *   - fetch a single tag's asset URL — `./github-asset-url`
 */

export {
  fetchReleaseAssetsViaGraphQL,
  getReleaseAssetUrl,
} from './github-asset-url'
export {
  fetchReleasesViaGraphQL,
  fetchReleasesViaRest,
  getLatestRelease,
} from './github-listing'

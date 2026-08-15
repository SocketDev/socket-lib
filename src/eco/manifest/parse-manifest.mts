/**
 * @file `parseManifest(content, ecosystem)` — dispatches to the right
 *   per-ecosystem manifest parser. On socket-btm's smol Node binary this routes
 *   to `node:smol-manifest`'s native `parseManifest`; on stock Node it
 *   dispatches to `src/eco/<eco>/parse-manifest.ts` (or `parse-package-json.ts`
 *   for npm). Throws `ManifestError(ERR_UNSUPPORTED)` for ecosystems with no
 *   parser yet (e.g. `'composer'`).
 */

import { ManifestError } from './manifest-error.mjs'
import { parsePackageJson } from '../npm/parse-package-json.mjs'
import { getSmolManifest } from '../../exe/smol/manifest.mjs'

import type { ParsedManifest } from './types.mjs'
import type { EcosystemString } from '../purl.mjs'

export function jsParseManifest(
  content: string,
  ecosystem: EcosystemString,
): ParsedManifest {
  switch (ecosystem) {
    case 'npm':
      return parsePackageJson(content)
    default:
      throw new ManifestError(
        `Unsupported ecosystem: ${ecosystem}`,
        'ERR_UNSUPPORTED',
      )
  }
}

const smol = getSmolManifest()

/* c8 ignore start - smol-fallback branch is smol Node binary only. */
const smolParseManifest = smol
  ? (content: string, ecosystem: EcosystemString) =>
      smol.parseManifest(content, ecosystem) as ParsedManifest
  : undefined
/* c8 ignore stop */

export const parseManifest: (
  content: string,
  ecosystem: EcosystemString,
) => ParsedManifest = smolParseManifest ?? jsParseManifest

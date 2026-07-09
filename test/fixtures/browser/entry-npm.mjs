// Browser-load contract for the npm/registry module. Proves that the module
// graph evaluates cleanly in a process-less context (no `process` global) and
// that the pure parsers work correctly without any Node builtins.
// The e2e test bundles this entry with webpack (library output) and executes
// the bundle inside a bare `node:vm` context.
import {
  buildCdnPath,
  encodePackageName,
  hasProvenance,
  parsePackument,
} from '@socketsecurity/lib/npm/registry'

export function run() {
  const registryEncoded = encodePackageName('@scope/pkg')
  const cdnEncoded = encodePackageName('@scope/pkg', { cdn: true })
  const cdnPath = buildCdnPath('@scope/pkg', '1.0.0')
  const packument = parsePackument({
    name: 'test-pkg',
    'dist-tags': { latest: '1.0.0' },
    versions: {
      '1.0.0': { dist: {} },
      '2.0.0': { dist: { attestations: { url: 'https://example.com' } } },
    },
  })
  const noAttestation = hasProvenance(packument?.versions['1.0.0'] ?? {})
  const withAttestation = hasProvenance(packument?.versions['2.0.0'] ?? {})
  return {
    cdnEncoded,
    cdnPath,
    name: packument?.name,
    noAttestation,
    registryEncoded,
    withAttestation,
  }
}

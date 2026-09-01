// Browser-load contract for the npm tarball reader's browser twin. Proves the
// module graph bundles for target:web and that the reader actually WORKS in a
// process-less context: gunzip through DecompressionStream, then a pure header
// walk, with no Node builtin anywhere in the graph.
// The tarball bytes are built by the test on the Node side and handed in, so
// no binary fixture is checked in.
// The e2e test bundles this entry with webpack (library output) and executes
// the bundle inside a bare `node:vm` context.
import {
  readNpmTarballEntries,
  readNpmTarballManifest,
} from '@socketsecurity/lib/eco/npm/registry/tarball/browser'

export async function run(bytes) {
  const entries = await readNpmTarballEntries(bytes)
  const manifest = await readNpmTarballManifest(bytes)
  return {
    manifestName: manifest?.name,
    manifestVersion: manifest?.version,
    names: entries.map(e => e.name).sort(),
  }
}

export async function rejectsPlainBytes() {
  try {
    await readNpmTarballEntries(new Uint8Array([0x7b, 0x7d]))
    return false
  } catch {
    return true
  }
}

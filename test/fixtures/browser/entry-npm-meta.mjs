// Browser-load contract for the npm metadata client's browser twin.
//
// Both imports use the BARE subpath, not the explicit `/browser` one. That is
// the point of the fixture: if the `browser` condition on `./npm/meta` and
// `./npm/meta-cache` were wrong, webpack would resolve the Node twin here and
// the bundle would either fail on a `node:` specifier or evaluate against
// node:fs at run time. Resolving the browser twin is therefore proven by the
// bundle existing and running, not asserted by a comment.
//
// `createWebStorageMetaCache` exists ONLY on the browser twin, so finding it
// callable in the bundle is a second, independent confirmation of which half
// the condition picked.
//
// The e2e test bundles this entry with webpack (library output) and executes
// the bundle inside a bare `node:vm` context holding only web globals.
import {
  createNpmMetaCache,
  createWebStorageMetaCache,
  getPackumentSlim,
} from '@socketsecurity/lib/npm/meta-cache'
import {
  getBatch,
  getLatestVersion,
  getVersions,
} from '@socketsecurity/lib/npm/meta'

// An injected adapter, so the run proves the client's own logic rather than
// the network. The default adapter is still bundled and evaluated.
function stubHttp(packument, calls) {
  return {
    async json(url) {
      calls.push(url)
      return packument
    },
  }
}

export async function run(packument) {
  const calls = []
  const http = stubHttp(packument, calls)
  const cache = createNpmMetaCache({ prefix: 'e2e-meta' })
  const meta = await getPackumentSlim('widget', { cache, http })
  const versions = await getVersions('widget', { cache, http })
  const latest = await getLatestVersion('widget', { cache, http })
  const batch = await getBatch(['widget', 'widget'], {
    cache,
    concurrency: 2,
    http,
  })
  return {
    batchLength: batch.length,
    fetches: calls.length,
    latest: latest.version,
    name: meta.name,
    versions: versions.versions,
  }
}

// A minimal `localStorage` work-alike. Proves the Web Storage opt-in path
// bundles and runs, and that an entry written by one cache instance is read
// back by a second one built over the same store — the browser equivalent of
// surviving a page reload.
function fakeStorage() {
  const map = new Map()
  return {
    get length() {
      return map.size
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    key(index) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key) {
      map.delete(key)
    },
    setItem(key, value) {
      map.set(key, value)
    },
  }
}

export async function runWithWebStorage(packument) {
  const calls = []
  const http = stubHttp(packument, calls)
  const storage = fakeStorage()
  await getPackumentSlim('widget', {
    cache: createWebStorageMetaCache(storage, { prefix: 'e2e-ws' }),
    http,
  })
  const reloaded = createWebStorageMetaCache(storage, { prefix: 'e2e-ws' })
  const meta = await getPackumentSlim('widget', { cache: reloaded, http })
  return {
    fetches: calls.length,
    name: meta.name,
    storedKeys: storage.length > 0,
  }
}

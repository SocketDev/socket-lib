/**
 * Pacote fetcher stub (throw-on-use).
 *
 * Pacote eagerly requires all five fetcher classes at the top of
 * pacote/lib/fetcher.js (Git, Registry, File, Dir, Remote). The runtime
 * only instantiates one based on `spec.type`. We only use `version` /
 * `range` / `tag` specs (→ RegistryFetcher), so Git/File/Dir/Remote
 * fetchers are never constructed.
 *
 * This stub exports a class that throws if instantiated — which would
 * surface an explicit error if a future caller accidentally passes a
 * non-registry spec, rather than silently failing with a misleading
 * downstream error.
 */
'use strict'

class PacoteFetcherStub {
  constructor() {
    throw new Error(
      'socket-lib bundle: this pacote fetcher is stubbed out. ' +
        'Only registry specs (name@version/range/tag) are supported.',
    )
  }
}

module.exports = PacoteFetcherStub

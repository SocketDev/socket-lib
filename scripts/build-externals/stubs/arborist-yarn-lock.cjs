/**
 * Arborist YarnLock stub.
 *
 * arborist/lib/shrinkwrap.js eagerly requires ./yarn-lock.js but only
 * instantiates `new YarnLock()` when a yarn.lock file actually exists
 * in the install dir (the `if (yarn)` branch). Our pin-generate flow
 * uses a scratch tmp dir with no yarn.lock and our install dir never
 * contains one either.
 *
 * Stub class throws on construction so an unexpected yarn.lock code
 * path fails loudly.
 */
'use strict'

class YarnLock {
  constructor() {
    throw new Error(
      'socket-lib bundle: YarnLock is stubbed — yarn.lock is not supported.',
    )
  }
}

module.exports = YarnLock

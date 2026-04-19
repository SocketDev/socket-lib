/**
 * Proggy stub — no-op progress tracker.
 *
 * Arborist's lib/tracker.js does `new proggy.Tracker(name)` and listens
 * for a 'done' event. We set `progress: false` in Arborist options so
 * trackers are created but the output is suppressed. Replacing the
 * Tracker class with a no-op that still emits `done` once satisfies
 * Arborist's contract without bundling proggy's 6 modules.
 */
'use strict'

const { EventEmitter } = require('node:events')

class Tracker extends EventEmitter {
  constructor(name) {
    super()
    this.name = name
  }
  finish() {
    this.emit('done')
  }
  update() {}
}

module.exports = { Tracker }

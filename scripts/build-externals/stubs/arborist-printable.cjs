/**
 * Arborist printable-tree stub.
 *
 * arborist/lib/node.js uses ./printable.js to produce JSON-serialisable
 * tree summaries via Node.prototype.toJSON() and the util.inspect.custom
 * hook. Arborist itself never JSON.stringify's a tree — the debug-only
 * output only surfaces if a caller dumps a tree. We don't.
 *
 * Identity stub returns a minimal summary to keep accidental callers
 * from crashing.
 */
'use strict'

module.exports = tree => ({
  name: tree?.name,
  version: tree?.version,
  note: 'socket-lib: printable stub',
})

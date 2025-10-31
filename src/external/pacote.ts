/**
 * Lazy-loaded pacote module.
 * Defers require() until first use to reduce startup time.
 */

let _pacote: typeof import('pacote') | undefined

/**
 * Get the pacote module, loading it on first access.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getPacote() {
  if (_pacote === undefined) {
    _pacote = /*@__PURE__*/ require('./pacote.js')
  }
  return _pacote as typeof import('pacote')
}

// Default export for convenience.
export default getPacote

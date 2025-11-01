/**
 * @fileoverview Main entry point for @socketsecurity/lib.
 * Clean, organized exports for better developer experience.
 */

// Export logger utilities for convenience
export { getDefaultLogger, Logger, LOG_SYMBOLS } from './logger'
// Export spinner utilities for convenience
export { getDefaultSpinner, Spinner } from './spinner'
// Export types
export * from './types'

// Manifest data helper function
export function getManifestData(ecosystem?: string, packageName?: string) {
  try {
    const manifestData = require('../manifest.json')

    if (!ecosystem) {
      return manifestData
    }

    const ecoData = manifestData[ecosystem]
    if (!ecoData) {
      return undefined
    }

    if (!packageName) {
      return ecoData
    }

    // ecoData is an array of [purl, data] entries
    if (Array.isArray(ecoData)) {
      const entry = ecoData.find(
        ([_purl, data]) => data.package === packageName,
      )
      return entry ? entry[1] : undefined
    }

    // Fallback for object-based structure
    const pkgData = ecoData[packageName]
    return pkgData ? [packageName, pkgData] : undefined
  } catch {
    return undefined
  }
}

// Version export
export const version = '3.0.1'

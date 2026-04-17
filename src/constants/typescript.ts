/**
 * @fileoverview TypeScript availability detection.
 * Exports small getters that probe whether the `typescript` package's type
 * definitions and lib files are resolvable from the current project.
 */

// TypeScript types/libs availability.
export function getTsTypesAvailable(): boolean {
  try {
    require.resolve('typescript/lib/lib.d.ts')
    return true
  } catch {
    return false
  }
}

export function getTsLibsAvailable(): boolean {
  try {
    require.resolve('typescript/lib')
    return true
  } catch {
    return false
  }
}

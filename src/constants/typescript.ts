/**
 * @file TypeScript availability detection. Exports small getters that probe
 *   whether the `typescript` package's type definitions and lib files are
 *   resolvable from the current project.
 */

/**
 * Check whether TypeScript's `lib/` directory is resolvable from the current
 * project by probing `typescript/lib`.
 *
 * @returns `true` when the `typescript` package's libs can be resolved.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function getTsLibsAvailable(): boolean {
  try {
    require.resolve('typescript/lib')
    return true
  } catch {
    return false
  }
}

/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function getTsTypesAvailable(): boolean {
  try {
    require.resolve('typescript/lib/lib.d.ts')
    return true
    /* c8 ignore start - TypeScript is a project devDep; the catch
       only fires when consumers run without typescript installed. */
  } catch {
    return false
  }
  /* c8 ignore stop */
}

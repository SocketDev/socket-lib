/**
 * @file Shimmer-configuration methods for the Socket `Spinner` class, split out
 *   of `create-spinner-class.ts` to keep that module under the file-size cap.
 *   The methods read and write the spinner's shimmer state through well-known
 *   symbols (`getShimmerSymbol`, `setShimmerSymbol`, `getSavedShimmerSymbol`,
 *   `setSavedShimmerSymbol`, `updateTextSymbol`) the class exposes, so they
 *   share the same private state without crossing the private-field boundary.
 *   `installShimmerMethods()` defines them on the prototype after the class is
 *   built.
 */

import type { ColorInherit, ColorValue } from '../colors/types'
import type { Palette, ShimmerConfig } from '../effects/shimmer'

import { COLOR_INHERIT } from './format'

import type { ShimmerInfo, SpinnerInstance } from './types'

/**
 * Well-known symbol the spinner class exposes to read its current shimmer
 * state.
 */
export const getShimmerSymbol: unique symbol = Symbol.for(
  'socket.spinner.getShimmer',
)

/**
 * Well-known symbol the spinner class exposes to replace its current shimmer
 * state.
 */
export const setShimmerSymbol: unique symbol = Symbol.for(
  'socket.spinner.setShimmer',
)

/**
 * Well-known symbol the spinner class exposes to read the saved shimmer config
 * that `enableShimmer()` restores from.
 */
export const getSavedShimmerSymbol: unique symbol = Symbol.for(
  'socket.spinner.getSavedShimmer',
)

/**
 * Well-known symbol the spinner class exposes to replace the saved shimmer
 * config.
 */
export const setSavedShimmerSymbol: unique symbol = Symbol.for(
  'socket.spinner.setSavedShimmer',
)

/**
 * Well-known symbol the spinner class exposes for its `#updateSpinnerText`
 * helper so the shimmer methods can trigger a re-render after a state change.
 */
export const updateTextSymbol: unique symbol = Symbol.for(
  'socket.spinner.updateText',
)

/**
 * Runtime shape of the spinner instance the shimmer methods operate on.
 */
export type ShimmerHost = SpinnerInstance & {
  [getShimmerSymbol]: () => ShimmerInfo | undefined
  [setShimmerSymbol]: (value: ShimmerInfo | undefined) => void
  [getSavedShimmerSymbol]: () => ShimmerInfo | undefined
  [setSavedShimmerSymbol]: (value: ShimmerInfo | undefined) => void
  [updateTextSymbol]: () => void
}

/**
 * Install the shimmer-configuration methods + `shimmerState` getter onto the
 * spinner prototype. The methods reach the spinner's private shimmer state
 * through the well-known symbols the class exposes.
 *
 * @param proto - The spinner class prototype to augment.
 */
export function installShimmerMethods(proto: object): void {
  const target = proto as Record<PropertyKey, unknown>

  function shimmerState(this: ShimmerHost): ShimmerInfo | undefined {
    const shimmer = this[getShimmerSymbol]()
    if (!shimmer) {
      return undefined
    }
    return {
      __proto__: null,
      color: shimmer.color,
      direction: shimmer.direction,
      speed: shimmer.speed,
      frame: shimmer.frame,
    } as ShimmerInfo
  }

  function disableShimmer(this: ShimmerHost): SpinnerInstance {
    // Clear the active shimmer; the saved config is left intact so
    // enableShimmer() can bring it back.
    this[setShimmerSymbol](undefined)
    this[updateTextSymbol]()
    return this
  }

  function enableShimmer(this: ShimmerHost): SpinnerInstance {
    const saved = this[getSavedShimmerSymbol]()
    if (saved) {
      // Restore the saved config with a fresh frame counter.
      this[setShimmerSymbol]({ ...saved, frame: 0 } as ShimmerInfo)
    } else {
      const next = {
        __proto__: null,
        color: COLOR_INHERIT,
        direction: 'ltr',
        speed: 1 / 3,
        frame: 0,
      } as ShimmerInfo
      this[setShimmerSymbol](next)
      this[setSavedShimmerSymbol](next)
    }
    this[updateTextSymbol]()
    return this
  }

  function setShimmer(
    this: ShimmerHost,
    config: ShimmerConfig,
  ): SpinnerInstance {
    const next = {
      __proto__: null,
      color:
        (config.color as ColorInherit | ColorValue | Palette | undefined) ??
        COLOR_INHERIT,
      direction: config.dir ?? 'ltr',
      speed: config.speed ?? 1 / 3,
      frame: 0,
    } as ShimmerInfo
    this[setShimmerSymbol](next)
    this[setSavedShimmerSymbol](next)
    this[updateTextSymbol]()
    return this
  }

  function updateShimmer(
    this: ShimmerHost,
    config: Partial<ShimmerConfig>,
  ): SpinnerInstance {
    /* c8 ignore start - each partial-config field branch fires only when caller updates that field; shimmer-state cascade covers three init paths */
    const partialConfig = {
      __proto__: null,
      ...config,
    } as Partial<ShimmerConfig>

    const update: Partial<ShimmerInfo> = {
      __proto__: null,
    } as Partial<ShimmerInfo>
    if (partialConfig.color !== undefined) {
      update.color = partialConfig.color as ColorInherit | ColorValue | Palette
    }
    if (partialConfig.dir !== undefined) {
      update.direction = partialConfig.dir
    }
    if (partialConfig.speed !== undefined) {
      update.speed = partialConfig.speed
    }

    const shimmer = this[getShimmerSymbol]()
    const saved = this[getSavedShimmerSymbol]()
    let next: ShimmerInfo
    if (shimmer) {
      next = { ...shimmer, ...update } as ShimmerInfo
    } else if (saved) {
      next = { ...saved, ...update, frame: 0 } as ShimmerInfo
    } else {
      next = {
        __proto__: null,
        color: COLOR_INHERIT,
        direction: 'ltr',
        speed: 1 / 3,
        frame: 0,
        ...update,
      } as ShimmerInfo
    }
    this[setShimmerSymbol](next)
    this[setSavedShimmerSymbol](next)
    this[updateTextSymbol]()
    return this
    /* c8 ignore stop */
  }

  Object.defineProperty(target, 'shimmerState', {
    configurable: true,
    enumerable: false,
    get: shimmerState,
  })
  target['disableShimmer'] = disableShimmer
  target['enableShimmer'] = enableShimmer
  target['setShimmer'] = setShimmer
  target['updateShimmer'] = updateShimmer
}

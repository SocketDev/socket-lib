/**
 * @file Public type surface for `events/exit/*` modules — the `OnExitOptions`
 *   consumed by `onExit`, plus the shared internal types for the signal
 *   emitter, emitted-signal map, and listener map. Pure types, no runtime side
 *   effects.
 */

import type { EventEmitter } from 'node:events'

// Type for tracking emitted signals.
export type EmittedSignals = {
  // Using string as signals can include custom events like 'exit' and 'afterexit'.
  [signal: string]: boolean
}

export type SignalExitEmitter = EventEmitter & {
  count?: number | undefined
  emitted?: EmittedSignals | undefined
  infinite?: boolean | undefined
}

export type SignalListener = () => void
// Type for signal listeners indexed by signal name.
export type SignalListenerMap = {
  [signal: string]: SignalListener
}

export interface OnExitOptions {
  alwaysLast?: boolean | undefined
}

/**
 * @fileoverview Public type surface for `signal-exit/*` modules — the
 * `OnExitOptions` consumed by `onExit`, plus the shared internal types
 * for the signal emitter, emitted-signal map, and listener map.
 * Pure types, no runtime side effects.
 */

// Type for tracking emitted signals.
export type EmittedSignals = {
  // Using string as signals can include custom events like 'exit' and 'afterexit'.
  [signal: string]: boolean
}

export type SignalExitEmitter = import('node:events').EventEmitter & {
  count?: number
  emitted?: EmittedSignals
  infinite?: boolean
}

export type SignalListener = () => void
// Type for signal listeners indexed by signal name.
export type SignalListenerMap = {
  [signal: string]: SignalListener
}

export interface OnExitOptions {
  alwaysLast?: boolean
}

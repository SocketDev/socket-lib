/**
 * @fileoverview Private internals for `signal-exit/*` modules — the
 * shared module-singleton state plus the lazy accessors that read
 * and mutate it. Owns the emitter, signal list, and `loaded` flag.
 * `lifecycle` (load/unload/getSignalListeners) and `intercept`
 * (processEmit/processReallyExit) share state through this leaf.
 *
 * Inlined signal-exit:
 *   https://socket.dev/npm/package/signal-exit/overview/4.1.0
 * ISC License — Copyright (c) 2015-2023 Benjamin Coe,
 * Isaac Z. Schlueter, and Contributors.
 */

import type { EmittedSignals, SignalExitEmitter } from './types'

// This is not the set of all possible signals.
//
// It IS, however, the set of all signals that trigger
// an exit on either Linux or BSD systems. Linux is a
// superset of the signal names supported on BSD, and
// the unknown signals just fail to register, so we can
// catch that easily enough.
//
// Don't bother with SIGKILL. It's uncatchable, which
// means that we can't fire any callbacks anyway.
//
// If a user does happen to register a handler on a non-
// fatal signal like SIGWINCH or something, and then
// exit, it'll end up firing `process.emit('exit')`, so
// the handler will be fired anyway.
//
// SIGBUS, SIGFPE, SIGSEGV and SIGILL, when not raised
// artificially, inherently leave the process in a
// state from which it is not safe to try and enter JS
// listeners.

export const globalProcess = globalThis.process as
  | (NodeJS.Process & {
      __signal_exit_emitter__?: import('node:events').EventEmitter
      reallyExit?: (code?: number | undefined) => never
    })
  | undefined
export const originalProcessEmit = globalProcess?.emit
export const platform = globalProcess?.platform ?? ''
export const originalProcessReallyExit = globalProcess?.reallyExit as
  | ((code?: number | undefined) => never)
  | undefined
export const WIN32 = platform === 'win32'

let _events: typeof import('node:events') | undefined
let _emitter: SignalExitEmitter | undefined
let _loaded = false
let _signals: string[] | undefined

/**
 * Read the loaded flag from a sibling leaf (lifecycle / on-exit).
 * @private
 */
export function isLoaded(): boolean {
  return _loaded
}

/**
 * Set the `loaded` flag from a sibling leaf (load / unload).
 * @private
 */
export function setLoaded(value: boolean): void {
  _loaded = value
}

/**
 * Get the cached signal list. Triggers lazy init on first call;
 * after `load()` runs it returns the filtered subset of successfully
 * registered signals instead of the full default list.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSignals(): string[] {
  if (_signals === undefined) {
    _signals = ['SIGABRT', 'SIGALRM', 'SIGHUP', 'SIGINT', 'SIGTERM']
    // WIN32-only branch tested on Windows runners; Linux branch on
    // Linux runners. Each runs on its target platform only.
    /* c8 ignore start */
    if (!WIN32) {
      _signals.push(
        'SIGVTALRM',
        'SIGXCPU',
        'SIGXFSZ',
        'SIGUSR2',
        'SIGTRAP',
        'SIGSYS',
        'SIGQUIT',
        'SIGIOT',
      )
    }
    if (platform === 'linux') {
      _signals.push('SIGIO', 'SIGPOLL', 'SIGPWR', 'SIGSTKFLT', 'SIGUNUSED')
    }
    /* c8 ignore stop */
  }
  return _signals as string[]
}

/**
 * Replace the cached signal list (used by `load()`'s filter step).
 * @private
 */
export function setSignals(value: string[]): void {
  _signals = value
}

/* c8 ignore start - Only called from signal-listener body and
   processEmit/processReallyExit interceptors, all of which are
   c8-ignored. Cannot be reached from the test runner. */
/*@__NO_SIDE_EFFECTS__*/
export function emit(
  event: string,
  code: number | undefined,
  signal: string | undefined,
): void {
  const emitter = getEmitter()
  if (emitter.emitted?.[event]) {
    return
  }
  if (emitter.emitted) {
    emitter.emitted[event] = true
  }
  emitter.emit(event, code, signal)
}
/* c8 ignore stop */

/*@__NO_SIDE_EFFECTS__*/
export function getEmitter() {
  // Lazy-init second-call branch; module-singleton. The pre-existing
  // emitter and infinite-listeners-already-enabled branches fire only
  // when another copy of signal-exit is loaded in the same process.
  /* c8 ignore start */
  if (_emitter === undefined) {
    if (globalProcess?.__signal_exit_emitter__) {
      _emitter = globalProcess.__signal_exit_emitter__
    } else if (globalProcess) {
      const EventEmitter = getEvents().EventEmitter
      _emitter = globalProcess.__signal_exit_emitter__ =
        new EventEmitter() as SignalExitEmitter
      _emitter.count = 0
      _emitter.emitted = { __proto__: null } as unknown as EmittedSignals
    }
    // Because this emitter is a global, we have to check to see if a
    // previous version of this library failed to enable infinite listeners.
    if (_emitter && !_emitter.infinite) {
      _emitter.setMaxListeners(Number.POSITIVE_INFINITY)
      _emitter.infinite = true
    }
  }
  /* c8 ignore stop */
  return _emitter as SignalExitEmitter
}

/*@__NO_SIDE_EFFECTS__*/
export function getEvents() {
  // Lazy-init second-call branch; module-singleton.
  /* c8 ignore start */
  if (_events === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _events = /*@__PURE__*/ require('node:events')
  }
  /* c8 ignore stop */
  return _events as typeof import('node:events')
}

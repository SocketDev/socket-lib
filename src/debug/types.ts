/**
 * @fileoverview Public type surface for `debug/*` modules — the
 * options bag accepted by every `debug*Ns` entrypoint and the
 * `InspectOptions` mirror of `node:util`'s shape (the public
 * subset we accept; not the full thing). Pure types, no runtime
 * side effects.
 */

export interface DebugOptions {
  namespaces?: string
  spinner?: { isSpinning: boolean; stop(): void; start(): void }
  [key: string]: unknown
}

export type NamespacesOrOptions = string | DebugOptions

export interface InspectOptions {
  depth?: number | null
  colors?: boolean
  [key: string]: unknown
}

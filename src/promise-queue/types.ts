/**
 * @file Public type surface for `promise-queue/*` modules — the `QueuedTask`
 *   storage shape used by the bounded-concurrency `PromiseQueue`. Pure types,
 *   no runtime side effects.
 */

export type QueuedTask<T> = {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

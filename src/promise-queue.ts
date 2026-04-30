/**
 * @fileoverview Bounded concurrency promise queue.
 * Exports the `PromiseQueue` class, which limits how many async tasks run
 * simultaneously, supports an optional max queue length (new tasks beyond
 * the cap are rejected with "Task dropped: queue length exceeded"), and
 * exposes an idle-wait helper.
 */

import { ErrorCtor, PromiseCtor, PromiseResolve } from './primordials'

type QueuedTask<T> = {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

export class PromiseQueue {
  private queue: Array<QueuedTask<unknown>> = []
  private running = 0
  private idleResolvers: Array<() => void> = []

  private readonly maxConcurrency: number
  private readonly maxQueueLength: number | undefined

  /**
   * Creates a new PromiseQueue
   * @param maxConcurrency - Maximum number of promises that can run concurrently
   * @param maxQueueLength - Maximum queue size; submissions past the cap
   * reject with "Task dropped: queue length exceeded" instead of evicting
   * a caller that has been waiting patiently. Callers must handle this
   * rejection or they'll see an unhandled rejection.
   */
  constructor(maxConcurrency: number, maxQueueLength?: number | undefined) {
    this.maxConcurrency = maxConcurrency
    this.maxQueueLength = maxQueueLength
    if (maxConcurrency < 1) {
      throw new ErrorCtor('maxConcurrency must be at least 1')
    }
  }

  /**
   * Add a task to the queue
   * @param fn - Async function to execute
   * @returns Promise that resolves with the function's result, or rejects
   * with "Task dropped: queue length exceeded" if the queue is full.
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return await new PromiseCtor<T>((resolve, reject) => {
      // Reject the newcomer rather than evicting an earlier-submitted task.
      // FIFO fairness: the caller who waited longest gets served, not the
      // caller who arrived last. Previously this dropped the queue head,
      // which punished patient callers and violated typical
      // bounded-queue semantics.
      if (
        this.maxQueueLength !== undefined &&
        this.queue.length >= this.maxQueueLength
      ) {
        reject(new ErrorCtor('Task dropped: queue length exceeded'))
        return
      }

      const task: QueuedTask<T> = { fn, resolve, reject }
      this.queue.push(task as QueuedTask<unknown>)
      this.runNext()
    })
  }

  private runNext(): void {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      this.notifyIdleIfNeeded()
      return
    }

    const task = this.queue.shift()
    if (!task) {
      return
    }

    this.running++

    // Wrap in Promise.resolve().then() so a synchronous throw inside
    // task.fn() converts into a rejection routed to task.reject rather
    // than escaping as an uncaught exception.
    PromiseResolve()
      .then(() => task.fn())
      .then(task.resolve)
      .catch(task.reject)
      .finally(() => {
        this.running--
        this.runNext()
      })
  }

  private notifyIdleIfNeeded(): void {
    if (this.running === 0 && this.queue.length === 0) {
      for (const resolve of this.idleResolvers) {
        resolve()
      }
      this.idleResolvers = []
    }
  }

  /**
   * Wait for all queued and running tasks to complete
   */
  async onIdle(): Promise<void> {
    if (this.running === 0 && this.queue.length === 0) {
      return
    }
    return await new PromiseCtor<void>(resolve => {
      this.idleResolvers.push(resolve)
    })
  }

  /**
   * Get the number of tasks currently running
   */
  get activeCount(): number {
    return this.running
  }

  /**
   * Get the number of tasks waiting in the queue
   */
  get pendingCount(): number {
    return this.queue.length
  }

  /**
   * Clear all pending tasks from the queue (does not affect running tasks)
   */
  clear(): void {
    const pending = this.queue
    this.queue = []
    for (const task of pending) {
      task.reject(new ErrorCtor('Task cancelled: queue cleared'))
    }
    this.notifyIdleIfNeeded()
  }
}

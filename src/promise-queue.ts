/**
 * @fileoverview Bounded concurrency promise queue.
 * Exports the `PromiseQueue` class, which limits how many async tasks run
 * simultaneously, supports an optional max queue length (dropping the oldest
 * pending task when exceeded), and exposes an idle-wait helper.
 */

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
   * @param maxQueueLength - Maximum queue size (older tasks are dropped if exceeded)
   */
  constructor(maxConcurrency: number, maxQueueLength?: number | undefined) {
    this.maxConcurrency = maxConcurrency
    this.maxQueueLength = maxQueueLength
    if (maxConcurrency < 1) {
      throw new Error('maxConcurrency must be at least 1')
    }
  }

  /**
   * Add a task to the queue
   * @param fn - Async function to execute
   * @returns Promise that resolves with the function's result
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = { fn, resolve, reject }

      if (
        this.maxQueueLength !== undefined &&
        this.queue.length >= this.maxQueueLength
      ) {
        // Drop oldest task to prevent memory buildup
        const droppedTask = this.queue.shift()
        if (droppedTask) {
          droppedTask.reject(new Error('Task dropped: queue length exceeded'))
        }
      }

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
    Promise.resolve()
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
    return await new Promise<void>(resolve => {
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
      task.reject(new Error('Task cancelled: queue cleared'))
    }
    this.notifyIdleIfNeeded()
  }
}

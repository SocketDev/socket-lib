import { describe, expect, it } from 'vitest'

import { PromiseQueue } from '../../src/promises/queue.mjs'

describe('PromiseQueue', () => {
  it.each([1, 5, 100])('accepts concurrency %i', concurrency => {
    const queue = new PromiseQueue(concurrency)
    expect(queue.activeCount).toBe(0)
    expect(queue.pendingCount).toBe(0)
  })

  it.each([0, -1])('rejects concurrency %i', concurrency => {
    expect(() => new PromiseQueue(concurrency)).toThrow(Error)
  })

  it('accepts a queue length limit', () => {
    expect(new PromiseQueue(1, 10).pendingCount).toBe(0)
    expect(new PromiseQueue(5, 100).pendingCount).toBe(0)
  })

  it('returns the result of one task', async () => {
    expect(await new PromiseQueue(1).add(async () => 'result')).toBe('result')
  })

  it('starts sequential tasks in submission order after the previous task completes', async () => {
    const queue = new PromiseQueue(1)
    const gates = Array.from({ length: 3 }, () => Promise.withResolvers<void>())
    const started: number[] = []
    const tasks = gates.map((gate, index) =>
      queue.add(async () => {
        started.push(index)
        await gate.promise
        return index
      }),
    )
    expect(started).toEqual([0])
    for (const [index, gate] of gates.entries()) {
      gate.resolve()
      expect(await tasks[index]).toBe(index)
      expect(started).toEqual([0, 1, 2].slice(0, Math.min(index + 2, 3)))
    }
    expect(queue.activeCount).toBe(0)
    expect(queue.pendingCount).toBe(0)
  })

  it('runs at most two tasks and starts the next task when a slot opens', async () => {
    const queue = new PromiseQueue(2)
    const gates = Array.from({ length: 4 }, () => Promise.withResolvers<void>())
    const started: number[] = []
    const tasks = gates.map((gate, index) =>
      queue.add(async () => {
        started.push(index)
        await gate.promise
        return index
      }),
    )
    expect(started).toEqual([0, 1])
    expect(queue.activeCount).toBe(2)
    expect(queue.pendingCount).toBe(2)
    gates[1]!.resolve()
    await tasks[1]
    expect(started).toEqual([0, 1, 2])
    expect(queue.activeCount).toBe(2)
    expect(queue.pendingCount).toBe(1)
    gates[0]!.resolve()
    await tasks[0]
    expect(started).toEqual([0, 1, 2, 3])
    gates[2]!.resolve()
    gates[3]!.resolve()
    expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3])
    expect(queue.activeCount).toBe(0)
    expect(queue.pendingCount).toBe(0)
  })

  it('returns heterogeneous task values', async () => {
    const queue = new PromiseQueue(2)
    expect(
      await Promise.all([
        queue.add(async () => 'string'),
        queue.add(async () => 42),
        queue.add(async () => ({ key: 'value' })),
        queue.add(async () => [1, 2, 3]),
        queue.add(async () => true),
      ]),
    ).toEqual(['string', 42, { key: 'value' }, [1, 2, 3], true])
  })

  it('rejects with the task error and continues processing', async () => {
    const queue = new PromiseQueue(1)
    const failure = new Error('fixture task failure')
    const failed = queue.add(async () => {
      throw failure
    })
    const succeeding = queue.add(async () => 'next result')
    await expect(failed).rejects.toBe(failure)
    expect(await succeeding).toBe('next result')
    expect(queue.activeCount).toBe(0)
  })

  it('rejects the newest submission while preserving the queued tasks in order', async () => {
    const queue = new PromiseQueue(1, 2)
    const gate = Promise.withResolvers<void>()
    const started: string[] = []
    const running = queue.add(async () => {
      await gate.promise
      return 'running'
    })
    const first = queue.add(async () => {
      started.push('first')
      return 'first'
    })
    const second = queue.add(async () => {
      started.push('second')
      return 'second'
    })
    await expect(
      queue.add(async () => {
        started.push('dropped')
      }),
    ).rejects.toThrow(Error)
    expect(queue.pendingCount).toBe(2)
    gate.resolve()
    expect(await Promise.all([running, first, second])).toEqual([
      'running',
      'first',
      'second',
    ])
    expect(started).toEqual(['first', 'second'])
  })

  it('accepts every task below the queue length limit', async () => {
    const queue = new PromiseQueue(1, 10)
    expect(
      await Promise.all([1, 2, 3].map(value => queue.add(async () => value))),
    ).toEqual([1, 2, 3])
  })

  it('clears pending tasks without cancelling the active task', async () => {
    const queue = new PromiseQueue(1)
    const gate = Promise.withResolvers<string>()
    const running = queue.add(async () => await gate.promise)
    const pending = [
      queue.add(async () => 'first'),
      queue.add(async () => 'second'),
    ]
    const settled = Promise.allSettled(pending)
    expect(queue.pendingCount).toBe(2)
    queue.clear()
    expect(queue.pendingCount).toBe(0)
    expect(queue.activeCount).toBe(1)
    const results = await settled
    expect(results.map(result => result.status)).toEqual([
      'rejected',
      'rejected',
    ])
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(Error)
      }
    }
    gate.resolve('active result')
    expect(await running).toBe('active result')
    expect(queue.activeCount).toBe(0)
  })

  it('accepts new tasks after clearing while an earlier task is active', async () => {
    const queue = new PromiseQueue(2)
    const gate = Promise.withResolvers<void>()
    const running = queue.add(async () => await gate.promise)
    queue.clear()
    expect(await queue.add(async () => 'new task')).toBe('new task')
    gate.resolve()
    await running
  })

  it('resolves onIdle for an empty queue', async () => {
    await expect(new PromiseQueue(1).onIdle()).resolves.toBeUndefined()
  })

  it('resolves all idle observers only after running and queued tasks finish', async () => {
    const queue = new PromiseQueue(2)
    const gates = Array.from({ length: 3 }, () => Promise.withResolvers<void>())
    const completed: number[] = []
    const tasks = gates.map((gate, index) =>
      queue.add(async () => {
        await gate.promise
        completed.push(index)
      }),
    )
    let idleCount = 0
    const observers = [queue.onIdle(), queue.onIdle()].map(async idle => {
      await idle
      idleCount++
    })
    gates[0]!.resolve()
    await tasks[0]
    expect(idleCount).toBe(0)
    expect(completed).toEqual([0])
    gates[1]!.resolve()
    await tasks[1]
    expect(idleCount).toBe(0)
    gates[2]!.resolve()
    await Promise.all([...tasks, ...observers])
    expect(completed).toEqual([0, 1, 2])
    expect(idleCount).toBe(2)
  })

  it('supports repeated busy and idle cycles', async () => {
    const queue = new PromiseQueue(1)
    for (let cycle = 0; cycle < 2; cycle++) {
      const gate = Promise.withResolvers<void>()
      const running = queue.add(async () => await gate.promise)
      const idle = queue.onIdle()
      gate.resolve()
      await Promise.all([running, idle])
      expect(queue.activeCount).toBe(0)
      expect(queue.pendingCount).toBe(0)
    }
  })

  it('handles twenty tasks without dropping results', async () => {
    const queue = new PromiseQueue(3, 50)
    const gate = Promise.withResolvers<void>()
    const values = Array.from({ length: 20 }, (...[, index]) => index)
    const tasks = values.map(value =>
      queue.add(async () => {
        await gate.promise
        return value
      }),
    )
    expect(queue.activeCount).toBe(3)
    expect(queue.pendingCount).toBe(17)
    gate.resolve()
    expect(await Promise.all(tasks)).toEqual(values)
    await queue.onIdle()
    expect(queue.activeCount).toBe(0)
    expect(queue.pendingCount).toBe(0)
  })

  it('keeps successful results when other tasks fail', async () => {
    const queue = new PromiseQueue(2)
    const firstFailure = new Error('fixture first failure')
    const secondFailure = new Error('fixture second failure')
    expect(
      await Promise.allSettled([
        queue.add(async () => 'success'),
        queue.add(async () => {
          throw firstFailure
        }),
        queue.add(async () => 'success2'),
        queue.add(async () => {
          throw secondFailure
        }),
      ]),
    ).toEqual([
      { status: 'fulfilled', value: 'success' },
      { status: 'rejected', reason: firstFailure },
      { status: 'fulfilled', value: 'success2' },
      { status: 'rejected', reason: secondFailure },
    ])
  })

  it('keeps separate queue instances independent', async () => {
    const first = new PromiseQueue(1)
    const second = new PromiseQueue(1)
    const gate = Promise.withResolvers<void>()
    const pending = first.add(async () => await gate.promise)
    expect(await second.add(async () => 'independent')).toBe('independent')
    await second.onIdle()
    expect(first.activeCount).toBe(1)
    expect(second.activeCount).toBe(0)
    gate.resolve()
    await pending
  })
})

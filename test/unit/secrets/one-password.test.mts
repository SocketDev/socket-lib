import { ChildProcess } from 'node:child_process'
import { afterEach, expect, test, vi } from 'vitest'
import { authorizeOnePasswordTerminal } from '../../../src/secrets/one-password.mts'
import type { OnePasswordAuthorizationOptions } from '../../../src/secrets/one-password.mts'

afterEach(() => vi.useRealTimers())

function authorizationRuntime(): NonNullable<
  OnePasswordAuthorizationOptions['runtime']
> {
  return {
    env: {},
    isTTY: true,
    spawn: vi.fn(),
    which: vi.fn(() => '/example/bin/op'),
  }
}

test('authorization attaches stdin, discards output and scrubs every provider override', async () => {
  const runtime = authorizationRuntime()
  runtime.env = {
    PATH: '/example/bin',
    OP_SESSION_example: 'fixture-session',
    OP_SERVICE_ACCOUNT_TOKEN: 'fixture-service',
    OP_CONNECT_HOST: 'fixture-host',
    OP_ACCOUNT: 'wrong',
    OP_BIOMETRIC_UNLOCK_ENABLED: 'false',
    OP_CONFIG_DIR: '/example/config',
    op_session: 'fixture-session',
  }
  const child = new ChildProcess()
  const launch = vi.fn(() => {
    queueMicrotask(() => child.emit('close', 0))
    return child
  })
  runtime.spawn = launch
  expect(
    await authorizeOnePasswordTerminal({
      account: 'example.1password.com',
      runtime,
    }),
  ).toEqual({ status: 'authorized' })
  expect(launch).toHaveBeenCalledWith(
    '/example/bin/op',
    ['signin', '--account', 'example.1password.com'],
    {
      shell: false,
      stdio: ['inherit', 'ignore', 'ignore'],
      env: {
        PATH: '/example/bin',
        OP_ACCOUNT: 'example.1password.com',
        OP_BIOMETRIC_UNLOCK_ENABLED: 'true',
      },
    },
  )
  expect(runtime.env['OP_ACCOUNT']).toBe('wrong')
})

test('noninteractive calls do not launch authorization', async () => {
  const runtime = authorizationRuntime()
  runtime.isTTY = false
  expect(
    await authorizeOnePasswordTerminal({ account: 'EXAMPLE123', runtime }),
  ).toEqual({ status: 'not-interactive' })
  expect(runtime.spawn).not.toHaveBeenCalled()
})

test.each([
  '',
  '--account',
  'https://example.1password.com',
  'example account',
  'example;command',
])('rejects invalid account %s before launch', account => {
  const runtime = authorizationRuntime()
  expect(() => authorizeOnePasswordTerminal({ account, runtime })).toThrow(
    TypeError,
  )
  expect(runtime.spawn).not.toHaveBeenCalled()
})

test.each([0, -1, 1.5, Number.POSITIVE_INFINITY, 2_147_483_648])(
  'rejects invalid timeout %s before launch',
  timeoutMs => {
    const runtime = authorizationRuntime()
    expect(() =>
      authorizeOnePasswordTerminal({ account: 'example', timeoutMs, runtime }),
    ).toThrow(RangeError)
    expect(runtime.spawn).not.toHaveBeenCalled()
  },
)

test.each(['ENOENT', 'EACCES'])('sanitizes launch failure %s', code => {
  const runtime = authorizationRuntime()
  runtime.spawn = () => {
    throw Object.assign(new Error('fixture-private-output'), { code })
  }
  return expect(
    authorizeOnePasswordTerminal({ account: 'example', runtime }),
  ).resolves.toEqual({
    status: code === 'ENOENT' ? 'cli-unavailable' : 'authorization-failed',
  })
})

test('reports denial or other failed authentication without provider output', async () => {
  const runtime = authorizationRuntime()
  runtime.spawn = () => {
    const child = new ChildProcess()
    queueMicrotask(() => child.emit('close', 1))
    return child
  }
  expect(
    await authorizeOnePasswordTerminal({ account: 'example', runtime }),
  ).toEqual({ status: 'authorization-failed', exitCode: 1 })
})

test('kills timed out authorization and waits for child closure', async () => {
  vi.useFakeTimers()
  const runtime = authorizationRuntime()
  const child = new ChildProcess()
  const kill = vi.spyOn(child, 'kill').mockReturnValue(true)
  runtime.spawn = () => child
  const result = authorizeOnePasswordTerminal({
    account: 'example',
    timeoutMs: 10,
    runtime,
  })
  await vi.advanceTimersByTimeAsync(10)
  expect(kill).toHaveBeenCalledWith('SIGKILL')
  const terminatedCode: null = null
  child.emit('close', terminatedCode)
  expect(await result).toEqual({ status: 'timed-out' })
  expect(vi.getTimerCount()).toBe(0)
})

test('maps asynchronous unavailable CLI errors without throwing private output', async () => {
  const runtime = authorizationRuntime()
  runtime.spawn = () => {
    const child = new ChildProcess()
    queueMicrotask(() =>
      child.emit(
        'error',
        Object.assign(new Error('fixture-private-output'), { code: 'ENOENT' }),
      ),
    )
    return child
  }
  expect(
    await authorizeOnePasswordTerminal({ account: 'example', runtime }),
  ).toEqual({ status: 'cli-unavailable' })
})

test('looks up op through the library resolver and reports missing CLI before launch', async () => {
  const runtime = authorizationRuntime()
  runtime.which = vi.fn(() => [])
  expect(
    await authorizeOnePasswordTerminal({ account: 'example', runtime }),
  ).toEqual({ status: 'cli-unavailable' })
  expect(runtime.which).toHaveBeenCalledWith('op', {
    path: undefined,
    nothrow: true,
  })
  expect(runtime.spawn).not.toHaveBeenCalled()
})

test('sanitizes executable lookup failures', async () => {
  const runtime = authorizationRuntime()
  runtime.which = () => {
    throw new Error('fixture-private-output')
  }
  expect(
    await authorizeOnePasswordTerminal({ account: 'example', runtime }),
  ).toEqual({ status: 'authorization-failed' })
  expect(runtime.spawn).not.toHaveBeenCalled()
})

test.each(['false', 'throw', 'no-close'])(
  'timeout completes when termination returns %s',
  async behavior => {
    vi.useFakeTimers()
    const runtime = authorizationRuntime()
    const child = new ChildProcess()
    vi.spyOn(child, 'kill').mockImplementation(() => {
      if (behavior === 'throw') {
        throw new Error('fixture-private-output')
      }
      return behavior !== 'false'
    })
    runtime.spawn = () => child
    const result = authorizeOnePasswordTerminal({
      account: 'example',
      timeoutMs: 1,
      runtime,
    })
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toEqual({ status: 'timed-out' })
    expect(() => child.emit('error', new Error('late failure'))).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  },
)

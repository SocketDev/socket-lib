import { expect, test, vi } from 'vitest'

import { readNpmOnePasswordCredential } from '../../../scripts/fleet/registry-infra/npm/one-password-login.mts'
import type { OnePasswordCliRuntime } from '../../../scripts/fleet/registry-infra/npm/one-password-login.mts'

function runtimeFor(responders: readonly string[]): OnePasswordCliRuntime {
  let index = 0
  return {
    spawnSync: vi.fn(() => {
      const stdout = responders[index++] ?? ''
      return { status: 0, stdout } as ReturnType<
        OnePasswordCliRuntime['spawnSync']
      >
    }),
  }
}

const listing = [
  {
    category: 'LOGIN',
    id: 'item-id',
    urls: [{ href: 'https://www.npmjs.com' }],
    vault: { id: 'vault-id' },
  },
]

test('matches npm by website and exact runtime username before requesting an OTP', () => {
  const runtime = runtimeFor([
    JSON.stringify(listing),
    'runtime-user\n',
    '123456\n',
  ])
  expect(readNpmOnePasswordCredential('runtime-user', 'otp', runtime)).toBe(
    '123456',
  )
  expect(runtime.spawnSync).toHaveBeenNthCalledWith(
    3,
    'op',
    ['item', 'get', 'item-id', '--vault', 'vault-id', '--otp'],
    expect.objectContaining({ shell: false, stdio: 'pipe' }),
  )
})

test('returns the password field only for a login page request', () => {
  const runtime = runtimeFor([
    JSON.stringify(listing),
    'runtime-user\n',
    'fixture-password\n',
  ])
  expect(
    readNpmOnePasswordCredential('runtime-user', 'password', runtime),
  ).toBe('fixture-password')
  expect(runtime.spawnSync).toHaveBeenCalledTimes(3)
  expect(runtime.spawnSync).toHaveBeenNthCalledWith(
    3,
    'op',
    [
      'item',
      'get',
      'item-id',
      '--vault',
      'vault-id',
      '--fields',
      'label=password',
      '--reveal',
    ],
    expect.objectContaining({ shell: false, stdio: 'pipe' }),
  )
})

test('does not request a secret when username or website does not match', () => {
  const wrongSite = [
    { ...listing[0]!, urls: [{ href: 'https://example.com' }] },
  ]
  const runtime = runtimeFor([JSON.stringify(wrongSite)])
  expect(
    readNpmOnePasswordCredential('runtime-user', 'otp', runtime),
  ).toBeUndefined()
  expect(runtime.spawnSync).toHaveBeenCalledTimes(1)

  const wrongUser = runtimeFor([JSON.stringify(listing), 'another-user\n'])
  expect(
    readNpmOnePasswordCredential('runtime-user', 'otp', wrongUser),
  ).toBeUndefined()
  expect(wrongUser.spawnSync).toHaveBeenCalledTimes(2)
})

test('refuses duplicate exact logins and malformed OTP values', () => {
  const duplicates = [...listing, { ...listing[0]!, id: 'second-item' }]
  const duplicateRuntime = runtimeFor([
    JSON.stringify(duplicates),
    'runtime-user\n',
    'runtime-user\n',
  ])
  expect(
    readNpmOnePasswordCredential('runtime-user', 'password', duplicateRuntime),
  ).toBeUndefined()
  expect(duplicateRuntime.spawnSync).toHaveBeenCalledTimes(3)

  const malformedOtp = runtimeFor([
    JSON.stringify(listing),
    'runtime-user\n',
    'private-output-not-a-code',
  ])
  expect(
    readNpmOnePasswordCredential('runtime-user', 'otp', malformedOtp),
  ).toBeUndefined()
})

test('falls back cleanly when the CLI output is not valid JSON', () => {
  const runtime = runtimeFor(['not-json'])
  expect(
    readNpmOnePasswordCredential('runtime-user', 'password', runtime),
  ).toBeUndefined()
  expect(runtime.spawnSync).toHaveBeenCalledTimes(1)
})

test('sanitizes CLI failures and rejects invalid usernames before launching op', () => {
  const runtime = {
    spawnSync: vi.fn(() => {
      throw new Error('private-cli-output')
    }),
  } as unknown as OnePasswordCliRuntime
  expect(
    readNpmOnePasswordCredential('runtime-user', 'otp', runtime),
  ).toBeUndefined()
  expect(runtime.spawnSync).toHaveBeenCalledTimes(1)

  const invalidRuntime = {
    spawnSync: vi.fn(),
  } as unknown as OnePasswordCliRuntime
  expect(
    readNpmOnePasswordCredential('', 'password', invalidRuntime),
  ).toBeUndefined()
  expect(invalidRuntime.spawnSync).not.toHaveBeenCalled()
})

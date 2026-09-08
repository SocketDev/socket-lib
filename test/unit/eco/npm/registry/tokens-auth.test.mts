import { describe } from 'vitest'
import {
  createNpmToken,
  deleteNpmToken,
} from '../../../../../src/eco/npm/registry/tokens.mjs'
import { testAuthRoutes } from './auth-challenges.mjs'

describe('tokens onAuth callbacks', () => {
  testAuthRoutes([
    {
      call: async (options: never) =>
        await createNpmToken({ name: 'ci', password: 'pw' }, options),
      command: 'token',
      name: 'POST /-/npm/v1/tokens',
    },
    {
      call: async (options: never) => await deleteNpmToken('npm_abc', options),
      command: 'token',
      name: 'DELETE /-/npm/v1/tokens/token/{token}',
    },
  ])
})

/**
 * @fileoverview Unit tests for GitHub release download utilities.
 */

import { describe, expect, it } from 'vitest'

import { SOCKET_BTM_REPO } from '@socketsecurity/lib/releases/github'

describe('releases/github', () => {
  describe('SOCKET_BTM_REPO', () => {
    it('should export socket-btm repository config', () => {
      expect(SOCKET_BTM_REPO).toEqual({
        owner: 'SocketDev',
        repo: 'socket-btm',
      })
    })
  })
})

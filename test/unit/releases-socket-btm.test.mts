/**
 * @fileoverview Unit tests for socket-btm release download wrapper.
 */

import { describe, expect, it } from 'vitest'

import os from 'node:os'

describe('releases/socket-btm', () => {
  it('should have os module available for platform detection', () => {
    expect(os.platform()).toBeDefined()
    expect(os.arch()).toBeDefined()
  })
})

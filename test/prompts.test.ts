/**
 * @fileoverview Tests for themed prompt stubs.
 */

import { confirm, input, select } from '@socketsecurity/lib/prompts'
import { describe, expect, it } from 'vitest'

describe('prompts', () => {
  describe('input', () => {
    it('should throw not implemented error', async () => {
      await expect(
        input({
          message: 'Enter your name:',
        }),
      ).rejects.toThrow('input() not yet implemented')
    })
  })

  describe('confirm', () => {
    it('should throw not implemented error', async () => {
      await expect(
        confirm({
          message: 'Continue?',
        }),
      ).rejects.toThrow('confirm() not yet implemented')
    })
  })

  describe('select', () => {
    it('should throw not implemented error', async () => {
      await expect(
        select({
          message: 'Choose:',
          choices: [
            { label: 'Option 1', value: '1' },
            { label: 'Option 2', value: '2' },
          ],
        }),
      ).rejects.toThrow('select() not yet implemented')
    })
  })
})

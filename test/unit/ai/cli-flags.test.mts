import { describe, expect, test } from 'vitest'

import {
  isUnknownCliOption,
  OPTIONAL_CLI_FLAGS,
  withoutCliFlag,
} from '../../../src/ai/cli-flags'

describe('OPTIONAL_CLI_FLAGS', () => {
  test('carries --effort, the flag newest-CLI-only builds reject', () => {
    expect(OPTIONAL_CLI_FLAGS).toContain('--effort')
  })
})

describe('isUnknownCliOption', () => {
  test("detects commander's rejection for the named flag", () => {
    expect(
      isUnknownCliOption('', "error: unknown option '--effort'", '--effort'),
    ).toBe(true)
  })

  test('detects the getopt and argparse spellings', () => {
    expect(
      isUnknownCliOption('', 'unrecognized option: --effort', '--effort'),
    ).toBe(true)
    expect(
      isUnknownCliOption('unknown argument --effort', '', '--effort'),
    ).toBe(true)
  })

  test('matches case-insensitively', () => {
    expect(
      isUnknownCliOption('', "ERROR: Unknown Option '--Effort'", '--effort'),
    ).toBe(true)
  })

  test('returns false when a DIFFERENT flag was rejected', () => {
    expect(
      isUnknownCliOption('', "error: unknown option '--model'", '--effort'),
    ).toBe(false)
  })

  test('returns false when the flag appears without a rejection', () => {
    expect(
      isUnknownCliOption('running with --effort high', '', '--effort'),
    ).toBe(false)
  })

  test('returns false on empty output', () => {
    expect(isUnknownCliOption('', '', '--effort')).toBe(false)
  })
})

describe('withoutCliFlag', () => {
  test('drops the flag and the value that follows it', () => {
    expect(
      withoutCliFlag(
        ['--print', '--effort', 'high', '--model', 'opus'],
        '--effort',
      ),
    ).toEqual(['--print', '--model', 'opus'])
  })

  test('leaves args untouched when the flag is absent', () => {
    expect(withoutCliFlag(['--print', '--model', 'opus'], '--effort')).toEqual([
      '--print',
      '--model',
      'opus',
    ])
  })

  test('drops every occurrence', () => {
    expect(
      withoutCliFlag(
        ['--effort', 'low', '--print', '--effort', 'high'],
        '--effort',
      ),
    ).toEqual(['--print'])
  })

  test('drops a trailing flag that has no value', () => {
    expect(withoutCliFlag(['--print', '--effort'], '--effort')).toEqual([
      '--print',
    ])
  })

  test('returns an empty list for empty input', () => {
    expect(withoutCliFlag([], '--effort')).toEqual([])
  })
})

/**
 * @file Unit tests for shell/parse.
 */

import { describe, expect, it } from 'vitest'

import {
  eachSimpleCommand,
  findBinCall,
  findBinCalls,
  hasBinCall,
  parseShell,
  simpleCommandStartsWith,
} from '../../../src/shell/parse'

describe('shell/parse', () => {
  it('tokenizes a bare command', () => {
    expect(parseShell('git status')).toEqual(['git', 'status'])
  })

  it('strips quotes around a multi-word arg', () => {
    expect(parseShell('git commit -m "hello world"')).toEqual([
      'git',
      'commit',
      '-m',
      'hello world',
    ])
  })

  it('surfaces operators as op tokens', () => {
    expect(parseShell('ls && echo done')).toEqual([
      'ls',
      { op: '&&' },
      'echo',
      'done',
    ])
  })

  it('surfaces a pipe as an op token', () => {
    expect(parseShell('cat f | wc -l')).toEqual([
      'cat',
      'f',
      { op: '|' },
      'wc',
      '-l',
    ])
  })

  it('resolves an env var against the provided record', () => {
    expect(parseShell('echo $HOME', { HOME: '/root' })).toEqual([
      'echo',
      '/root',
    ])
  })

  it('collapses an unresolved env var to an empty string', () => {
    expect(parseShell('echo $MISSING')).toEqual(['echo', ''])
  })

  it('surfaces a comment as a comment token', () => {
    expect(parseShell('ls # list')).toEqual(['ls', { comment: ' list' }])
  })
})

describe('shell/parse findBinCalls', () => {
  it('finds the args of a bare bin call', () => {
    expect(findBinCalls('sudo apt update', ['sudo'])).toEqual([
      ['apt', 'update'],
    ])
  })

  it('returns the args of every bin call in a chain', () => {
    expect(findBinCalls('sudo apt update && sudo -k', ['sudo'])).toEqual([
      ['apt', 'update'],
      ['-k'],
    ])
  })

  it('matches a multi-token prefix', () => {
    expect(
      findBinCalls('gh auth refresh -s workflow', ['gh', 'auth', 'refresh']),
    ).toEqual([['-s', 'workflow']])
  })

  it('does not match args embedded in a quoted string', () => {
    expect(findBinCalls('echo "sudo foo"', ['sudo'])).toEqual([])
  })

  it('splits on op tokens (`;` / `&&` / `||` / `|`)', () => {
    expect(findBinCalls('a ; sudo b ; c', ['sudo'])).toEqual([['b']])
    expect(findBinCalls('a || sudo b || c', ['sudo'])).toEqual([['b']])
    expect(findBinCalls('a | sudo b | c', ['sudo'])).toEqual([['b']])
  })

  it('returns an empty array when no bin call matches', () => {
    expect(findBinCalls('echo hi', ['sudo'])).toEqual([])
  })

  it('tolerates a partially-parseable command without crashing', () => {
    // shell-quote's parser is permissive — an unterminated quote
    // collapses to the literal token after the quote. We don't crash;
    // we don't promise much about the result shape either.
    const out = findBinCalls('sudo "broken', ['sudo'])
    expect(Array.isArray(out)).toBe(true)
  })

  it('returns args after a multi-token prefix only', () => {
    expect(
      findBinCalls('gh auth refresh && gh auth status', [
        'gh',
        'auth',
        'refresh',
      ]),
    ).toEqual([[]])
  })
})

describe('shell/parse findBinCall', () => {
  it('returns the args of the first matching bin call', () => {
    expect(findBinCall('sudo apt update && sudo -k', ['sudo'])).toEqual([
      'apt',
      'update',
    ])
  })

  it('returns undefined when no bin call matches', () => {
    expect(findBinCall('echo hi', ['sudo'])).toBeUndefined()
  })

  it('does not match args embedded in a quoted string', () => {
    expect(findBinCall('echo "sudo foo"', ['sudo'])).toBeUndefined()
  })

  it('matches a multi-token prefix', () => {
    expect(
      findBinCall('gh auth refresh -s workflow', ['gh', 'auth', 'refresh']),
    ).toEqual(['-s', 'workflow'])
  })
})

describe('shell/parse simpleCommandStartsWith', () => {
  it('matches a single-token prefix', () => {
    expect(simpleCommandStartsWith(['sudo', 'apt', 'update'], ['sudo'])).toBe(
      true,
    )
  })

  it('matches a multi-token prefix', () => {
    expect(
      simpleCommandStartsWith(
        ['gh', 'auth', 'refresh', '-s', 'workflow'],
        ['gh', 'auth', 'refresh'],
      ),
    ).toBe(true)
  })

  it('returns false when the first token mismatches', () => {
    expect(simpleCommandStartsWith(['ls'], ['sudo'])).toBe(false)
  })

  it('returns false when a later prefix token mismatches', () => {
    expect(
      simpleCommandStartsWith(
        ['gh', 'auth', 'status'],
        ['gh', 'auth', 'refresh'],
      ),
    ).toBe(false)
  })

  it('returns false when tokens is shorter than prefix', () => {
    expect(simpleCommandStartsWith(['gh'], ['gh', 'auth'])).toBe(false)
  })

  it('returns true for an empty prefix against any tokens', () => {
    // Edge case: an empty prefix has zero tokens to fail; every tokens
    // array starts with the empty prefix.
    expect(simpleCommandStartsWith(['ls'], [])).toBe(true)
  })

  it('returns true when prefix equals tokens exactly', () => {
    expect(simpleCommandStartsWith(['sudo'], ['sudo'])).toBe(true)
  })
})

describe('shell/parse eachSimpleCommand', () => {
  it('visits each simple command in order', () => {
    const visited: string[][] = []
    eachSimpleCommand('sudo apt && rm -rf /', tokens => {
      visited.push([...tokens])
    })
    expect(visited).toEqual([
      ['sudo', 'apt'],
      ['rm', '-rf', '/'],
    ])
  })

  it('skips simple commands separated by `;`', () => {
    const visited: string[][] = []
    eachSimpleCommand('a ; b ; c', tokens => {
      visited.push([...tokens])
    })
    expect(visited).toEqual([['a'], ['b'], ['c']])
  })

  it('skips simple commands separated by `||`', () => {
    const visited: string[][] = []
    eachSimpleCommand('a || b', tokens => {
      visited.push([...tokens])
    })
    expect(visited).toEqual([['a'], ['b']])
  })

  it('skips simple commands separated by `|`', () => {
    const visited: string[][] = []
    eachSimpleCommand('cat f | wc -l', tokens => {
      visited.push([...tokens])
    })
    expect(visited).toEqual([
      ['cat', 'f'],
      ['wc', '-l'],
    ])
  })

  it('short-circuits when the visitor returns true', () => {
    const visited: string[][] = []
    eachSimpleCommand('a ; b ; c', tokens => {
      visited.push([...tokens])
      if (tokens[0] === 'b') {
        return true
      }
    })
    expect(visited).toEqual([['a'], ['b']])
  })

  it('continues when the visitor returns undefined or false', () => {
    const visited: string[][] = []
    eachSimpleCommand('a ; b', tokens => {
      visited.push([...tokens])
      return false
    })
    expect(visited).toEqual([['a'], ['b']])
  })

  it('does not visit empty segments (consecutive operators)', () => {
    // shell-quote emits ops back-to-back here; the walk only flushes
    // when current has tokens, so no empty visit.
    const visited: string[][] = []
    eachSimpleCommand('a && && b', tokens => {
      visited.push([...tokens])
    })
    // Implementation-defined whether `&&` mid-expression yields one or
    // two visits; just verify no empty tokens slipped through.
    for (const t of visited) {
      expect(t.length).toBeGreaterThan(0)
    }
  })

  it('handles a command with no operators (single simple command)', () => {
    const visited: string[][] = []
    eachSimpleCommand('ls -la', tokens => {
      visited.push([...tokens])
    })
    expect(visited).toEqual([['ls', '-la']])
  })

  it('handles an empty command', () => {
    const visited: string[][] = []
    eachSimpleCommand('', tokens => {
      visited.push([...tokens])
    })
    expect(visited).toEqual([])
  })

  it('ignores comment and glob tokens', () => {
    const visited: string[][] = []
    eachSimpleCommand('ls # comment', tokens => {
      visited.push([...tokens])
    })
    expect(visited).toEqual([['ls']])
  })
})

describe('shell/parse hasBinCall', () => {
  it('returns true when at least one bin call matches', () => {
    expect(hasBinCall('echo hi && sudo rm', ['sudo'])).toBe(true)
  })

  it('returns false for an embedded mention', () => {
    expect(hasBinCall('echo "sudo foo"', ['sudo'])).toBe(false)
  })

  it('matches a multi-token prefix', () => {
    expect(
      hasBinCall('gh auth refresh -s workflow', ['gh', 'auth', 'refresh']),
    ).toBe(true)
  })

  it('tolerates a partially-parseable command without crashing', () => {
    const out = hasBinCall('sudo "broken', ['sudo'])
    expect(typeof out).toBe('boolean')
  })
})

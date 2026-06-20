/**
 * @file Unit tests for socket/no-spawn-stream-double-consume.
 */

import { describe, test } from 'node:test'

import { RuleTester } from '../../../lib/rule-tester.mts'
import rule from '../index.mts'

describe('socket/no-spawn-stream-double-consume', () => {
  test('valid + invalid cases', () => {
    new RuleTester().run('no-spawn-stream-double-consume', rule, {
      valid: [
        {
          name: 'awaited result — the correct way to read captured output',
          code: 'const { stdout } = await spawn(cmd, args, { stdioString: true })\n',
        },
        {
          name: 'streaming a spawn stream WITHOUT setEncoding is fine (Buffer mode)',
          code: 'const c = spawn(cmd, args)\nc.process.stderr.on("data", chunk => { buf += chunk.toString("utf8") })\n',
        },
        {
          name: 'piping a spawn stream without setEncoding is fine',
          code: 'const { process: child } = spawn(cmd, args)\nchild.stdout.pipe(dest)\n',
        },
        {
          name: 'reading a spawn stream without setEncoding is fine',
          code: 'const c = spawn(cmd, args)\nc.process.stdout.read()\n',
        },
        {
          name: 'listening on the process (not a stdout/stderr stream)',
          code: 'const { process: child } = spawn(cmd, args)\nchild.on("exit", f)\n',
        },
        {
          name: 'non-data event on a spawn stream is fine (error/close/end)',
          code: 'const c = spawn(cmd, args)\nc.process.stdout.on("error", f)\nc.process.stderr.on("close", g)\n',
        },
        {
          name: 'writing to stdin is not consuming an output stream',
          code: 'const c = spawn(cmd, args)\nc.process.stdin.end(line)\n',
        },
        {
          name: 'setEncoding on a stream that is NOT a spawn child',
          code: 'const s = fs.createReadStream(p)\ns.setEncoding("utf8")\ns.on("data", f)\n',
        },
        {
          name: 'bare-spawn access is the OTHER rule’s job, not flagged here',
          code: 'const c = spawn(cmd, args)\nc.stdout.setEncoding("utf8")\n',
        },
        {
          name: 'allow comment on the flagged line',
          code: 'const { process } = spawn(cmd, args)\n// socket-lint: allow spawn-stream-double-consume\nprocess.stdout.setEncoding("utf8")\n',
        },
      ],
      invalid: [
        {
          name: 'destructured process → stdout.setEncoding (the crash)',
          code: 'const { process } = spawn(cmd, args)\nprocess.stdout.setEncoding("utf8")\n',
          errors: [{ messageId: 'spawnStreamDoubleConsume' }],
        },
        {
          name: 'var = spawn → process.stderr.setEncoding',
          code: 'const c = spawn(cmd, args)\nc.process.stderr.setEncoding("utf8")\n',
          errors: [{ messageId: 'spawnStreamDoubleConsume' }],
        },
        {
          name: 'renamed destructured process → stdout.setEncoding',
          code: 'const { process: child } = spawn(cmd, args)\nchild.stdout.setEncoding("utf8")\n',
          errors: [{ messageId: 'spawnStreamDoubleConsume' }],
        },
        {
          name: 'intermediate stream var → setEncoding',
          code: 'const c = spawn(cmd, args)\nconst s = c.process.stdout\ns.setEncoding("utf8")\n',
          errors: [{ messageId: 'spawnStreamDoubleConsume' }],
        },
        {
          name: 'inline spawn().process.stderr.setEncoding',
          code: 'spawn(cmd, args).process.stderr.setEncoding("utf8")\n',
          errors: [{ messageId: 'spawnStreamDoubleConsume' }],
        },
        {
          name: 'member-form lib.spawn tracked too → stdout.setEncoding',
          code: 'const c = lib.spawn(cmd, args)\nc.process.stdout.setEncoding("ascii")\n',
          errors: [{ messageId: 'spawnStreamDoubleConsume' }],
        },
        {
          name: 'destructured stream off the process → setEncoding',
          code: 'const { process: child } = spawn(cmd, args)\nconst { stdout } = child\nstdout.setEncoding("utf8")\n',
          errors: [{ messageId: 'spawnStreamDoubleConsume' }],
        },
      ],
    })
  })
})

import process from 'node:process'

import { expect } from 'vitest'

import { spawn } from '../../../../../src/process/spawn/child.mjs'
import { itUnixOnly } from '../../../../../test/unit/util/platform-suites.mjs'

async function processGroupId(pid: number): Promise<number> {
  const result = await spawn('ps', ['-o', 'pgid=', '-p', String(pid)])
  const groupId = Number(result.stdout.trim())
  if (!Number.isInteger(groupId)) {
    throw new Error('Could not read the process group ID.')
  }
  return groupId
}

for (const { detached, expectedGroup } of [
  { detached: true, expectedGroup: 'child' },
  { detached: false, expectedGroup: 'parent' },
  { detached: undefined, expectedGroup: 'parent' },
]) {
  const detachedLabel = detached === undefined ? 'omitted' : String(detached)
  itUnixOnly(
    `sets the child process group when detached is ${detachedLabel}`,
    async () => {
      const options = {
        stdio: 'ignore' as const,
        throws: false,
        ...(detached === undefined ? {} : { detached }),
      }
      const child = spawn(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        options,
      )
      try {
        const childProcess = child.process
        await new Promise<void>((resolve, reject) => {
          childProcess.once('spawn', resolve)
          childProcess.once('error', reject)
        })
        if (childProcess.pid === undefined) {
          throw new Error('Spawned child process has no process ID.')
        }
        const [childGroup, parentGroup] = await Promise.all([
          processGroupId(childProcess.pid),
          processGroupId(process.pid),
        ])
        expect(childGroup).toBe(
          expectedGroup === 'child' ? childProcess.pid : parentGroup,
        )
      } finally {
        child.process.kill('SIGKILL')
        await child.catch(() => {})
      }
    },
  )
}

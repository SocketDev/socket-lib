/**
 * @file DLX binary coverage for the unified hash option. Both supported hash
 *   representations are verified against a local server so normalization and
 *   download verification stay covered together.
 */

import crypto from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { dlxBinary } from '../../../src/dlx/binary'
import { mockHomeDir, runWithTempDir } from '../util/temp-file-helper'
import { startDlxTestServer, stopDlxTestServer } from './binary-test-server.mts'

import type { DlxTestServer } from './binary-test-server.mts'

let testServer: DlxTestServer

beforeAll(async () => {
  testServer = await startDlxTestServer()
})

afterAll(async () => {
  await stopDlxTestServer(testServer.server)
})

describe.sequential('dlx/binary hash normalization', () => {
  it('accepts an integrity hash object', async () => {
    await runWithTempDir(async tmpDir => {
      const restoreHome = mockHomeDir(tmpDir)
      const isWindows = process.platform === 'win32'
      const content = isWindows
        ? '@echo off\necho "windows script"'
        : '#!/bin/bash\necho "verified binary"'
      const integrity = `sha512-${crypto
        .createHash('sha512')
        .update(content)
        .digest('base64')}`

      try {
        const result = await dlxBinary([], {
          hash: { type: 'integrity', value: integrity },
          name: `integrity-hash-binary${isWindows ? '.cmd' : ''}`,
          url: `${testServer.baseUrl}/${isWindows ? 'binary-windows.cmd' : 'binary-with-integrity'}`,
        })

        expect(result.downloaded).toBe(true)
        await result.spawnPromise
      } finally {
        restoreHome()
      }
    }, 'dlx-binary-integrity-hash-')
  })

  it('accepts a checksum hash object', async () => {
    await runWithTempDir(async tmpDir => {
      const restoreHome = mockHomeDir(tmpDir)
      const isWindows = process.platform === 'win32'
      const content = isWindows
        ? '@echo off\necho "windows script"'
        : '#!/bin/bash\necho "test binary"'
      const checksum = crypto.createHash('sha256').update(content).digest('hex')

      try {
        const result = await dlxBinary([], {
          hash: { type: 'checksum', value: checksum },
          name: `checksum-hash-binary${isWindows ? '.cmd' : ''}`,
          url: `${testServer.baseUrl}/${isWindows ? 'binary-windows.cmd' : 'binary'}`,
        })

        expect(result.downloaded).toBe(true)
        await result.spawnPromise
      } finally {
        restoreHome()
      }
    }, 'dlx-binary-checksum-hash-')
  })
})

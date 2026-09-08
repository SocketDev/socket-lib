import http from 'node:http'
import { Socket } from 'node:net'

import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { setupHttpFixture } from './http-request-fixtures.mjs'

const createServerSpy = vi.spyOn(http, 'createServer')
let server: http.Server

setupHttpFixture()

beforeAll(() => {
  server = createServerSpy.mock.results[0]!.value
})

afterAll(() => {
  createServerSpy.mockRestore()
})

it.each(['__proto__', 'constructor', 'hasOwnProperty'])(
  'does not dispatch inherited fixture handler %s',
  url => {
    const socket = new Socket()
    const request = new http.IncomingMessage(socket)
    request.url = url
    const response = new http.ServerResponse(request)
    const endSpy = vi.spyOn(response, 'end').mockReturnValue(response)

    try {
      server.emit('request', request, response)
      expect(endSpy).toHaveBeenCalledWith('OK')
    } finally {
      endSpy.mockRestore()
      socket.destroy()
    }
  },
)

import type { Readable, Writable } from 'node:stream'

export interface PackOptions {
  entries?: string[]
  dereference?: boolean
  filter?: (name: string) => boolean
  fs?: any
  ignore?: (name: string) => boolean
  map?: (header: any) => any
  mapStream?: (stream: Readable, header: any) => Readable
  pack?: any
  sort?: boolean
  strip?: number
}

export interface ExtractOptions {
  dereference?: boolean
  filter?: (name: string, header: any) => boolean
  fs?: any
  ignore?: (name: string, header: any) => boolean
  map?: (header: any) => any
  mapStream?: (stream: Readable, header: any) => Readable
  readable?: boolean
  strip?: number
  strict?: boolean
  umask?: number
  writable?: boolean
}

export function pack(cwd: string, opts?: PackOptions): Readable
export function extract(cwd: string, opts?: ExtractOptions): Writable

/*
 * @file A tar pack typed the way it behaves, for the specs that build archives
 *   in memory.
 *
 *   WHY THIS EXISTS. streamx ships INCOMPLETE class declarations, and
 *   tar-stream's own types inherit the gap. In streamx 2.28.0,
 *   `declare class Writable` lists only its statics (isBackpressured, drained)
 *   with no instance `write`/`end`, and `Readable` likewise declares no `pipe`.
 *   tar-stream 3 declares `Sink extends Writable` and `Pack extends Readable`,
 *   so the methods every caller uses are missing from the .d.ts while present
 *   at runtime — streamx has implemented them since 2.x.
 *
 *   Three specs drove the same surface, so the description lives here once
 *   rather than three times. It is NOT `any`: every use downstream stays
 *   checked, and a typo in a header field is still an error.
 *
 *   WHEN TO DELETE THIS. When streamx declares its instance methods, drop this
 *   module and call `pack()` from `tar-stream` directly.
 */

import { pack as tarStreamPack } from 'tar-stream'

export interface TarEntrySink {
  end(): void
  write(chunk: Uint8Array): boolean
}

export interface TarPackHeader {
  linkname?: string | undefined
  name: string
  size?: number | undefined
  type?: string | undefined
}

export interface TarPackStream {
  entry(
    header: TarPackHeader,
    buffer?: string | Uint8Array | undefined,
  ): TarEntrySink
  finalize(): void
  pipe<T>(destination: T): T
  /**
   * A pack is an async iterable of its own bytes — how a caller collects the
   * archive without a destination stream. streamx's Readable implements this
   * and does not declare it, same gap as the rest of this file.
   */
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>
}

/**
 * A tar pack, with the instance methods streamx omits from its types.
 *
 * The one assertion behind this whole gap. Callers get a fully checked surface.
 */
export function createTarPack(): TarPackStream {
  return tarStreamPack() as unknown as TarPackStream
}

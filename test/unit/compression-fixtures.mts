/**
 * @file Shared fixtures and helpers for the compression unit tests
 *   (compression.test.mts + compression-gzip.test.mts). Keeps the two
 *   per-format test files under the file-size cap while sharing the same
 *   input corpora and stream-draining helper.
 */

import { Buffer } from 'node:buffer'

// Two fixture sizes:
//   - small: a few hundred bytes — exercises the in-memory path
//   - large: ~1 MB of repeating JSON — exercises the streaming path
//     and lets us verify the compressed size is meaningfully smaller
export const SMALL_TEXT = 'The quick brown fox jumps over the lazy dog. '.repeat(
  20,
)
export const LARGE_TEXT = JSON.stringify({
  items: Array.from({ length: 5000 }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    description: `A description of item ${i} with some repeated text to compress well`,
    tags: ['alpha', 'beta', 'gamma', 'delta'],
  })),
})

export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

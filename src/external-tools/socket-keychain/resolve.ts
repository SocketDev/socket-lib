/**
 * @file Security-sensitive resolver for socket-keychain. It accepts only an
 *   exact version and integrity pin and never searches the ambient PATH.
 */

import { socketKeychainFromDownload } from './from-download'

import type { SocketKeychainFromDownloadOptions } from './from-download'
import type { ResolvedSocketKeychain } from './types'

export async function resolveSocketKeychain(
  options: SocketKeychainFromDownloadOptions,
): Promise<ResolvedSocketKeychain> {
  return await socketKeychainFromDownload(options)
}

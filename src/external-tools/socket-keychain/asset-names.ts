/**
 * @file GitHub Release names for the standalone socket-keychain executable.
 */

import { ObjectFreeze, ObjectKeys } from '../../primordials/object'

export interface SocketKeychainAssetEntry {
  readonly asset: string
  readonly binary: string
}

export const SOCKET_KEYCHAIN_ASSET_MAP: Readonly<
  Record<string, SocketKeychainAssetEntry>
> = ObjectFreeze({
  __proto__: null,
  'darwin-arm64': ObjectFreeze({
    __proto__: null,
    asset: 'socket-keychain-{version}-darwin-arm64',
    binary: 'socket-keychain',
  }) as unknown as SocketKeychainAssetEntry,
  'darwin-x64': ObjectFreeze({
    __proto__: null,
    asset: 'socket-keychain-{version}-darwin-x64',
    binary: 'socket-keychain',
  }) as unknown as SocketKeychainAssetEntry,
  'linux-arm64': ObjectFreeze({
    __proto__: null,
    asset: 'socket-keychain-{version}-linux-arm64',
    binary: 'socket-keychain',
  }) as unknown as SocketKeychainAssetEntry,
  'linux-x64': ObjectFreeze({
    __proto__: null,
    asset: 'socket-keychain-{version}-linux-x64',
    binary: 'socket-keychain',
  }) as unknown as SocketKeychainAssetEntry,
  'win32-x64': ObjectFreeze({
    __proto__: null,
    asset: 'socket-keychain-{version}-win32-x64.exe',
    binary: 'socket-keychain.exe',
  }) as unknown as SocketKeychainAssetEntry,
}) as unknown as Readonly<Record<string, SocketKeychainAssetEntry>>

export const SOCKET_KEYCHAIN_SUPPORTED_PLATFORM_ARCHES: readonly string[] =
  ObjectFreeze(ObjectKeys(SOCKET_KEYCHAIN_ASSET_MAP)) as readonly string[]

export interface SocketKeychainDownloadOptions {
  platformArch: string
  version: string
}

export function getSocketKeychainAssetEntry(
  platformArch: string,
  version: string,
): SocketKeychainAssetEntry | undefined {
  const template = SOCKET_KEYCHAIN_ASSET_MAP[platformArch]
  if (!template) {
    return undefined
  }
  return {
    asset: template.asset.replace('{version}', version),
    binary: template.binary,
  }
}

export function getSocketKeychainDownloadUrl(
  options: SocketKeychainDownloadOptions,
): string | undefined {
  const { platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const entry = getSocketKeychainAssetEntry(platformArch, version)
  if (!entry) {
    return undefined
  }
  return (
    `https://github.com/SocketDev/socket-btm/releases/download/` +
    `socket-keychain-v${version}/${entry.asset}`
  )
}

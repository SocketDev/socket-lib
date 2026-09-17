import os from 'node:os'
import path from 'node:path'

import { getSocketWheelhouseDir } from '@socketsecurity/lib-stable/paths/socket'

export const BROWSER_BRIDGE_RUNTIME_DIR = path.join(
  getSocketWheelhouseDir(),
  'browser-bridge',
)
export const BROWSER_BRIDGE_LAST_FAILURE = path.join(
  BROWSER_BRIDGE_RUNTIME_DIR,
  'last-failure.json',
)
export const BROWSER_BRIDGE_LOCAL_ROOT = path.join(
  BROWSER_BRIDGE_RUNTIME_DIR,
  'installed',
)
export const BROWSER_BRIDGE_LOCAL_ACTIVE = path.join(
  BROWSER_BRIDGE_LOCAL_ROOT,
  'active',
)
export const BROWSER_BRIDGE_LOCAL_EXTENSION = path.join(
  BROWSER_BRIDGE_LOCAL_ACTIVE,
  'extension',
)
export const BROWSER_BRIDGE_LOCAL_APP = path.join(
  BROWSER_BRIDGE_LOCAL_ACTIVE,
  'Wheelhouse Browser Bridge.app',
)
export const BROWSER_BRIDGE_LOCAL_RECEIPT = path.join(
  BROWSER_BRIDGE_LOCAL_ACTIVE,
  'bridge-build.json',
)
export const BROWSER_BRIDGE_RECEIPT_RELATIVE_PATH = path.join(
  'Contents',
  'Resources',
  'bridge-build.json',
)
export const BROWSER_BRIDGE_LOCAL_MANIFEST = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'NativeMessagingHosts',
  'dev.socket.wheelhouse.browser_bridge.json',
)

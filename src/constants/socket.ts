/**
 * @file Socket.dev branding and identifier constants. Centralizes API base
 *   URLs, the public API key, website/docs URLs, npm scopes, GitHub org/repo
 *   names, and app name strings used across the Socket toolchain.
 */

// Socket.dev API.
export const SOCKET_API_BASE_URL = 'https://api.socket.dev/v0'
export const SOCKET_PUBLIC_API_KEY =
  'sktsec_t_--RAN5U4ivauy4w37-6aoKyYPDt5ZbaT5JBVMqiwKo_api'
// Alias for backward compatibility.
export const SOCKET_PUBLIC_API_TOKEN = SOCKET_PUBLIC_API_KEY

// Socket.dev URLs.
export const SOCKET_WEBSITE_URL = 'https://socket.dev'
export const SOCKET_CONTACT_URL = 'https://socket.dev/contact'
export const SOCKET_DASHBOARD_URL = 'https://socket.dev/dashboard'
export const SOCKET_API_TOKENS_URL =
  'https://socket.dev/dashboard/settings/api-tokens'
export const SOCKET_PRICING_URL = 'https://socket.dev/pricing'
export const SOCKET_STATUS_URL = 'https://status.socket.dev'
export const SOCKET_DOCS_URL = 'https://docs.socket.dev'
export const SOCKET_DOCS_CONTACT_URL =
  'https://docs.socket.dev/docs/contact-support'

// Socket.dev scopes.
export const SOCKET_REGISTRY_SCOPE = '@socketregistry'
export const SOCKET_SECURITY_SCOPE = '@socketsecurity'
export const SOCKET_OVERRIDE_SCOPE = '@socketoverride'

// Socket.dev organization and repositories.
export const SOCKET_GITHUB_ORG = 'SocketDev'
export const SOCKET_REGISTRY_REPO_NAME = 'socket-registry'
export const SOCKET_REGISTRY_PACKAGE_NAME = '@socketsecurity/registry'
export const SOCKET_REGISTRY_NPM_ORG = 'socketregistry'

// The `_` prefix that marks a Socket-managed subdir of ~/.socket/. Applies to
// BOTH app dirs (_socket, _registry) and infra/storage dirs (_cacache, _dlx,
// _state) — so it is a DIR prefix, not an "app" prefix.
export const SOCKET_DIR_PREFIX = '_'

// Full names of the Socket-managed infra/storage DIRS under ~/.socket/ (the `_`
// prefix included — these are dirs, not apps, and the bare form is never used
// on its own). `_cacache` content-addressable cache; `_dlx` name+version binary
// store (node, jre, python, sfw, …); `_state` version-LESS persistent app state
// (= pnpm `state-dir` / XDG_STATE_HOME); `_wheelhouse` cross-fleet shared bin.
export const SOCKET_DIR = {
  __proto__: null,
  cacache: `${SOCKET_DIR_PREFIX}cacache`,
  dlx: `${SOCKET_DIR_PREFIX}dlx`,
  state: `${SOCKET_DIR_PREFIX}state`,
  wheelhouse: `${SOCKET_DIR_PREFIX}wheelhouse`,
} as unknown as Readonly<
  Record<'cacache' | 'dlx' | 'state' | 'wheelhouse', string>
>

// Socket.dev lib.
export const SOCKET_LIB_NAME = '@socketsecurity/lib'
export const SOCKET_LIB_VERSION: string =
  process.env['INLINED_LIB_VERSION'] ?? '0.0.0'

// Socket.dev IPC.
export const SOCKET_IPC_HANDSHAKE = 'SOCKET_IPC_HANDSHAKE'

// Socket.dev cache and registry.
export const CACHE_SOCKET_API_DIR = 'socket-api'
export const REGISTRY = 'registry'
export const REGISTRY_SCOPE_DELIMITER = '__'

/**
 * @file Directory name and path pattern constants.
 */

// Directory names.
export const NODE_MODULES = 'node_modules'
export const DOT_GIT_DIR = '.git'
export const DOT_GITHUB = '.github'
export const DOT_SOCKET_DIR = '.socket'
export const CACHE_DIR = 'cache'
export const CACHE_TTL_DIR = 'ttl'
// Runtime subdir of an app's state dir (~/.socket/_state/<app>/run/) — home for
// a daemon's Unix socket + concurrency.lock + <socket>.pid.
export const RUN_DIR = 'run'

// Path patterns.
export const NODE_MODULES_GLOB_RECURSIVE = '**/node_modules'
export const SLASH_NODE_MODULES_SLASH = '/node_modules/'

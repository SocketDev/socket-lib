/**
 * @file Public type surface for `ipc-cli/*` modules — the `IpcObject` record
 *   describing the `SOCKET_CLI_*` env-var shape forwarded from a parent Socket
 *   CLI to a child process. Pure types, no runtime side effects.
 */

export interface IpcObject {
  SOCKET_CLI_FIX?: string | undefined
  SOCKET_CLI_OPTIMIZE?: boolean | undefined
  SOCKET_CLI_SHADOW_ACCEPT_RISKS?: boolean | undefined
  SOCKET_CLI_SHADOW_API_TOKEN?: string | undefined
  SOCKET_CLI_SHADOW_BIN?: string | undefined
  SOCKET_CLI_SHADOW_PROGRESS?: boolean | undefined
  SOCKET_CLI_SHADOW_SILENT?: boolean | undefined
}

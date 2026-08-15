/**
 * @file Public type surface for `ipc/*` modules — the `IpcStub` shape that
 *   backs the file-based handoff. Pure types, no runtime side effects.
 */

/**
 * IPC stub file interface. Represents the structure of stub files used for
 * filesystem-based IPC.
 */
export interface IpcStub {
  /**
   * The actual data payload.
   */
  data: unknown
  /**
   * Process ID that created the stub.
   */
  pid: number
  /**
   * Creation timestamp for age validation.
   */
  timestamp: number
}

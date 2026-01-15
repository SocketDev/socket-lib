export interface WhichOptions {
  path?: string
  pathExt?: string
  all?: boolean
  nothrow?: boolean
}

interface WhichFunction {
  (cmd: string, options: WhichOptions & { all: true }): Promise<string[]>
  (
    cmd: string,
    options: WhichOptions & { nothrow: true; all?: false },
  ): Promise<string | null>
  (cmd: string, options?: WhichOptions): Promise<string>

  sync(cmd: string, options: WhichOptions & { all: true }): string[]
  sync(
    cmd: string,
    options: WhichOptions & { nothrow: true; all?: false },
  ): string | null
  sync(cmd: string, options?: WhichOptions): string
}

declare const which: WhichFunction
export default which

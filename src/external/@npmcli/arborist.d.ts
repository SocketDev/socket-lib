declare module '@npmcli/arborist' {
  class Arborist {
    constructor(options?: Arborist.Options)
    buildIdealTree(options?: Arborist.BuildIdealTreeOptions): Promise<void>
    reify(options?: Arborist.ReifyOptions): Promise<void>
  }

  namespace Arborist {
    interface Options {
      path?: string
      cache?: string
      omit?: Array<'dev' | 'optional' | 'peer'>
      [key: string]: unknown
    }

    interface BuildIdealTreeOptions {
      [key: string]: unknown
    }

    interface ReifyOptions {
      save?: boolean
      [key: string]: unknown
    }
  }

  export = Arborist
}

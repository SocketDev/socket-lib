declare namespace ArboristTypes {
  export interface Options {
    path?: string
    cache?: string
    omit?: Array<'dev' | 'optional' | 'peer'>
    [key: string]: unknown
  }

  export interface BuildIdealTreeOptions {
    [key: string]: unknown
  }

  export interface ReifyOptions {
    save?: boolean
    [key: string]: unknown
  }
}

export default class Arborist {
  constructor(options?: ArboristTypes.Options)
  buildIdealTree(options?: ArboristTypes.BuildIdealTreeOptions): Promise<void>
  reify(options?: ArboristTypes.ReifyOptions): Promise<void>
}

export { ArboristTypes }

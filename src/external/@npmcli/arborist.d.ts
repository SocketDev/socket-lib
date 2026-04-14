declare namespace ArboristTypes {
  export interface ArboristNode {
    package: {
      name?: string
      version?: string
      [key: string]: unknown
    }
    isProjectRoot: boolean
    name: string
    location: string
  }

  export interface IdealTree {
    inventory: Map<string, ArboristNode>
  }

  export interface Options {
    path?: string
    cache?: string
    omit?: Array<'dev' | 'optional' | 'peer'>
    [key: string]: unknown
  }

  export interface BuildIdealTreeOptions {
    add?: string[]
    [key: string]: unknown
  }

  export interface ReifyOptions {
    save?: boolean
    add?: string[]
    [key: string]: unknown
  }
}

export default class Arborist {
  idealTree: ArboristTypes.IdealTree | null
  constructor(options?: ArboristTypes.Options)
  buildIdealTree(
    options?: ArboristTypes.BuildIdealTreeOptions,
  ): Promise<ArboristTypes.IdealTree>
  reify(options?: ArboristTypes.ReifyOptions): Promise<void>
}

export { ArboristTypes }

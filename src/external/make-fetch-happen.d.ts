export interface FetchOptions {
  cache?: string
  headers?: Record<string, string>
  [key: string]: any
}

export interface MakeFetchHappen {
  (url: string, opts?: FetchOptions): Promise<Response>
  defaults(opts: FetchOptions): MakeFetchHappen
}

declare const makeFetchHappen: MakeFetchHappen
export default makeFetchHappen

export class RegistryFetcher {
  constructor(spec: string, opts?: any)
  cache: string
}

export interface Pacote {
  RegistryFetcher: typeof RegistryFetcher
  extract(spec: string, dest: string, opts?: any): Promise<any>
  manifest(spec: string, opts?: any): Promise<any>
  packument(spec: string, opts?: any): Promise<any>
  tarball(spec: string, opts?: any): Promise<Buffer>
}

declare const pacote: Pacote
export default pacote

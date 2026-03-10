export interface IZipEntry {
  entryName: string
  name: string
  comment: string
  isDirectory: boolean
  header: any
  getData(): Buffer
  getDataAsync(callback: (data: Buffer, err?: string) => void): void
  setData(value: string | Buffer): void
  getCompressedData(): Buffer
  toString(): string
}

export interface AdmZipOptions {
  noSort?: boolean
  readEntries?: boolean
  method?: number
  fs?: any
}

export interface AdmZipInstance {
  getEntries(): IZipEntry[]
  getEntry(name: string): IZipEntry | null
  addFile(
    entryName: string,
    content: Buffer,
    comment?: string,
    attr?: number,
  ): void
  addLocalFile(
    localPath: string,
    zipPath?: string,
    zipName?: string,
    comment?: string,
  ): void
  addLocalFolder(localPath: string, zipPath?: string, filter?: RegExp): void
  addZipComment(comment: string): void
  getZipComment(): string
  deleteFile(entryName: string): void
  extractAllTo(
    targetPath: string,
    overwrite?: boolean,
    keepOriginalPermission?: boolean,
    outFileName?: string,
  ): void
  extractEntryTo(
    entry: string | IZipEntry,
    targetPath: string,
    maintainEntryPath?: boolean,
    overwrite?: boolean,
    keepOriginalPermission?: boolean,
    outFileName?: string,
  ): boolean
  readAsText(fileName: string, encoding?: string): string
  readFile(
    entry: string | IZipEntry,
    callback?: (data: Buffer, err?: string) => void,
  ): Buffer | undefined
  readFileAsync(
    entry: string | IZipEntry,
    callback: (data: Buffer, err: string) => void,
  ): void
  toBuffer(
    onSuccess?: Function,
    onFail?: Function,
    onItemStart?: Function,
    onItemEnd?: Function,
  ): Buffer | null
  writeZip(
    targetFileName?: string,
    callback?: (error: Error | null) => void,
  ): void
  writeZipPromise(targetFileName?: string, props?: object): Promise<void>
}

export interface AdmZipConstructor {
  new (filePath?: string | Buffer, options?: AdmZipOptions): AdmZipInstance
  (filePath?: string | Buffer, options?: AdmZipOptions): AdmZipInstance
}

declare const AdmZip: AdmZipConstructor
export default AdmZip

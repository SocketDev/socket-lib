/**
 * @file Editable JSON file manipulation with formatting preservation.
 */

import process from 'node:process'
import { sleep } from '../promises/timers'

import { isErrnoException } from '../errors/predicates'
import { getNodeFs } from '../node/fs'

import { ErrorCtor } from '../primordials/error'
import { JSONParse } from '../primordials/json'
import {
  detectIndent,
  detectNewline,
  getFormattingFromContent,
  INDENT_SYMBOL,
  NEWLINE_SYMBOL,
  shouldSave as shouldSaveUtil,
  sortKeys,
  stringifyWithFormatting,
  stripFormattingSymbols,
} from './format'

import type {
  EditableJsonConstructor,
  EditableJsonInstance,
  EditableJsonOptions,
  EditableJsonSaveOptions,
} from './types'

const identSymbol = INDENT_SYMBOL
const newlineSymbol = NEWLINE_SYMBOL

let editableJsonClass: EditableJsonConstructor | undefined
/**
 * Get the EditableJson class for JSON file manipulation.
 *
 * @example
 *   ;```ts
 *   import { getEditableJsonClass } from '@socketsecurity/lib/json/edit'
 *
 *   const EditableJson = getEditableJsonClass<MyConfigType>()
 *   const config = await EditableJson.load('./config.json')
 *   config.update({ someField: 'newValue' })
 *   await config.save({ sort: true })
 *   ```
 */
export function getEditableJsonClass<
  T = Record<string, unknown>,
>(): EditableJsonConstructor<T> {
  if (editableJsonClass === undefined) {
    editableJsonClass = class EditableJson<
      InstanceData = Record<string, unknown>,
    > implements EditableJsonInstance<InstanceData> {
      canSave = true
      contentData: InstanceData = {} as InstanceData
      pathValue: string | undefined = undefined
      readFileContent = ''
      readFileJson: unknown = undefined

      get content(): Readonly<InstanceData> {
        return this.contentData
      }

      get filename(): string {
        const path = this.pathValue
        if (!path) {
          return ''
        }
        return path
      }

      get path(): string | undefined {
        return this.pathValue
      }

      static async create<T = Record<string, unknown>>(
        path: string,
        opts: EditableJsonOptions<T> = {
          __proto__: null,
        } as EditableJsonOptions<T>,
      ): Promise<EditableJsonInstance<T>> {
        const instance = new EditableJson<T>()
        instance.create(path)
        return opts.data ? instance.update(opts.data) : instance
      }

      static async load<T = Record<string, unknown>>(
        path: string,
        opts: EditableJsonOptions<T> = {
          __proto__: null,
        } as EditableJsonOptions<T>,
      ): Promise<EditableJsonInstance<T>> {
        const instance = new EditableJson<T>()
        if (!opts.create) {
          return await instance.load(path)
        }
        try {
          return await instance.load(path)
          // !isErrnoException arm fires only on non-Error throws; the
          // re-throw fires on non-ENOENT errors. Tests exercise the
          // ENOENT-create-fallback path.
          /* c8 ignore start */
        } catch (err: unknown) {
          if (!isErrnoException(err) || err.code !== 'ENOENT') {
            throw err
          }
          return instance.create(path)
        }
        /* c8 ignore stop */
      }

      create(path: string): this {
        this.pathValue = path
        this.contentData = {} as InstanceData
        this.canSave = true
        return this
      }

      fromContent(data: unknown): this {
        this.contentData = data as InstanceData
        this.canSave = false
        return this
      }

      fromJSON(data: string): this {
        const parsed = JSONParse(data) as InstanceData & Record<symbol, unknown>
        // Extract and preserve formatting metadata
        const indent = detectIndent(data)
        const newline = detectNewline(data)

        // Store formatting metadata using symbols
        ;(parsed as Record<symbol, unknown>)[identSymbol] = indent
        ;(parsed as Record<symbol, unknown>)[newlineSymbol] = newline

        this.contentData = parsed as InstanceData
        return this
      }

      async load(path: string): Promise<this> {
        this.pathValue = path
        this.readFileContent = await readFile(this.filename)
        this.fromJSON(this.readFileContent)
        // Add AFTER fromJSON is called in case it errors.
        this.readFileJson = JSONParse(this.readFileContent)
        return this
      }

      async save(
        options?: EditableJsonSaveOptions | undefined,
      ): Promise<boolean> {
        options = { __proto__: null, ...options } as typeof options
        if (!this.canSave || this.content === undefined) {
          throw new ErrorCtor('No file path to save to')
        }

        // Check if save is needed
        if (
          !shouldSaveUtil(
            this.content as Record<string | symbol, unknown>,
            this.readFileJson as Record<string | symbol, unknown>,
            this.readFileContent,
            options,
          )
        ) {
          return false
        }

        // Get content and formatting
        const content = stripFormattingSymbols(
          this.content as Record<string | symbol, unknown>,
        )
        /* c8 ignore next - sort:true arm fires only when caller opts in */
        const sortedContent = options?.sort ? sortKeys(content) : content
        const formatting = getFormattingFromContent(
          this.content as Record<string | symbol, unknown>,
        )

        // Generate file content
        const fileContent = stringifyWithFormatting(sortedContent, formatting)

        // Save to disk with retry logic for Windows file locking issues
        await retryWrite(this.filename, fileContent)
        this.readFileContent = fileContent
        this.readFileJson = JSONParse(fileContent)
        return true
      }

      saveSync(options?: EditableJsonSaveOptions | undefined): boolean {
        options = { __proto__: null, ...options } as typeof options
        if (!this.canSave || this.content === undefined) {
          throw new ErrorCtor('No file path to save to')
        }

        // Check if save is needed
        if (
          !shouldSaveUtil(
            this.content as Record<string | symbol, unknown>,
            this.readFileJson as Record<string | symbol, unknown>,
            this.readFileContent,
            options,
          )
        ) {
          return false
        }

        // Get content and formatting
        const content = stripFormattingSymbols(
          this.content as Record<string | symbol, unknown>,
        )
        /* c8 ignore next - sort:true arm fires only when caller opts in */
        const sortedContent = options?.sort ? sortKeys(content) : content
        const formatting = getFormattingFromContent(
          this.content as Record<string | symbol, unknown>,
        )

        // Generate file content
        const fileContent = stringifyWithFormatting(sortedContent, formatting)

        // Save to disk
        const fs = getNodeFs()
        fs.writeFileSync(this.filename, fileContent)
        this.readFileContent = fileContent
        this.readFileJson = JSONParse(fileContent)
        return true
      }

      update(content: Partial<InstanceData>): this {
        this.contentData = {
          ...this.contentData,
          ...content,
        } as InstanceData
        return this
      }

      willSave(options?: EditableJsonSaveOptions | undefined): boolean {
        if (!this.canSave || this.content === undefined) {
          return false
        }

        return shouldSaveUtil(
          this.content as Record<string | symbol, unknown>,
          this.readFileJson as Record<string | symbol, unknown>,
          this.readFileContent,
          options,
        )
      }
    } as EditableJsonConstructor
  }
  return editableJsonClass as EditableJsonConstructor<T>
}

/**
 * Read file content from disk with retry logic for ENOENT errors.
 *
 * @private
 */
export async function readFile(filepath: string): Promise<string> {
  const { promises: fsPromises } = getNodeFs()

  // Retry on ENOENT. Windows-only retry-count and delay; tested on
  // Windows runners. The retry-loop body itself fires only after a
  // transient ENOENT, which tests don't simulate.
  /* c8 ignore start */
  const maxRetries = process.platform === 'win32' ? 5 : 1
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fsPromises.readFile(filepath, 'utf8')
    } catch (e) {
      const isLastAttempt = attempt === maxRetries
      const isEnoent = isErrnoException(e) && e.code === 'ENOENT'

      if (!isEnoent || isLastAttempt) {
        throw e
      }

      const delay = process.platform === 'win32' ? 50 * (attempt + 1) : 20
      await sleep(delay)
    }
  }
  /* c8 ignore stop */

  /* c8 ignore next 3 - Loop has 'return' on success and 'throw' in
     each iteration; only reachable if maxRetries is somehow negative. */
  throw new ErrorCtor(
    `readFile: exhausted ${maxRetries + 1} attempts reading ${filepath}`,
  )
}

/**
 * Retry a file write operation with exponential backoff on Windows EPERM
 * errors. Windows can have transient file locking issues with temp
 * directories.
 *
 * @private
 */
export async function retryWrite(
  filepath: string,
  content: string,
  retries = 3,
  baseDelay = 10,
): Promise<void> {
  const fs = getNodeFs()
  const { promises: fsPromises } = fs

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await fsPromises.writeFile(filepath, content)
      /* c8 ignore start - Windows-only flush+verify loop. Tested on
         Windows runners. */
      // On Windows, add a delay and verify file exists to ensure it's fully flushed
      // This prevents ENOENT errors when immediately reading after write
      // Windows CI runners are significantly slower than local development
      if (process.platform === 'win32') {
        // Initial delay to allow OS to flush the write
        await sleep(50)
        // Verify the file is actually present with retries
        let accessRetries = 0
        const maxAccessRetries = 5
        while (accessRetries < maxAccessRetries) {
          if (fs.existsSync(filepath)) {
            // Small final delay to ensure stability
            await sleep(10)
            break
          }
          // If file isn't present yet, wait with increasing delays
          const delay = 20 * (accessRetries + 1)
          await sleep(delay)
          accessRetries++
        }
      }
      /* c8 ignore stop */
      return
      // Retry-loop catch fires only when writeFile throws on Windows
      // file-system races; tests don't simulate EPERM/EBUSY.
      /* c8 ignore start */
    } catch (e) {
      const isLastAttempt = attempt === retries
      const isRetriableError =
        isErrnoException(e) &&
        (e.code === 'EBUSY' || e.code === 'ENOENT' || e.code === 'EPERM')

      if (!isRetriableError || isLastAttempt) {
        throw e
      }

      const delay = baseDelay * 2 ** attempt
      await sleep(delay)
    }
    /* c8 ignore stop */
  }
}

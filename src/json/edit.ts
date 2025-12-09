/**
 * @fileoverview Editable JSON file manipulation with formatting preservation.
 */

import { setTimeout as sleep } from 'node:timers/promises'

import {
  INDENT_SYMBOL,
  NEWLINE_SYMBOL,
  detectIndent,
  detectNewline,
  getFormattingFromContent,
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

// IMPORTANT: Do not use destructuring here - use direct assignment instead.
// tsgo has a bug that incorrectly transpiles destructured exports, resulting in
// `exports.SomeName = void 0;` which causes runtime errors.
// See: https://github.com/SocketDev/socket-packageurl-js/issues/3
const JSONParse = JSON.parse

let _EditableJsonClass: EditableJsonConstructor | undefined

let _fs: typeof import('node:fs') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Retry a file write operation with exponential backoff on Windows EPERM errors.
 * Windows can have transient file locking issues with temp directories.
 * @private
 */
async function retryWrite(
  filepath: string,
  content: string,
  retries = 3,
  baseDelay = 10,
): Promise<void> {
  const { promises: fsPromises } = getFs()

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fsPromises.writeFile(filepath, content)
      // On Windows, add a delay and verify file exists to ensure it's fully flushed
      // This prevents ENOENT errors when immediately reading after write
      // Windows CI runners are significantly slower than local development
      if (process.platform === 'win32') {
        // Initial delay to allow OS to flush the write
        // eslint-disable-next-line no-await-in-loop
        await sleep(50)
        // Verify the file is actually readable with retries
        let accessRetries = 0
        const maxAccessRetries = 5
        while (accessRetries < maxAccessRetries) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await fsPromises.access(filepath)
            // Small final delay to ensure stability
            // eslint-disable-next-line no-await-in-loop
            await sleep(10)
            break
          } catch {
            // If file isn't accessible yet, wait with increasing delays
            const delay = 20 * (accessRetries + 1)
            // eslint-disable-next-line no-await-in-loop
            await sleep(delay)
            accessRetries++
          }
        }
      }
      return
    } catch (err) {
      const isLastAttempt = attempt === retries
      const isRetriableError =
        err instanceof Error &&
        'code' in err &&
        (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'ENOENT')

      // Only retry on Windows file system errors (EPERM/EBUSY/ENOENT), and not on the last attempt
      if (!isRetriableError || isLastAttempt) {
        throw err
      }

      // Exponential backoff: 10ms, 20ms, 40ms
      const delay = baseDelay * 2 ** attempt
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay)
    }
  }
}

/**
 * Parse JSON content and extract formatting metadata.
 * @private
 */
function parseJson(content: string): unknown {
  return JSONParse(content)
}

/**
 * Read file content from disk with retry logic for ENOENT errors.
 * @private
 */
async function readFile(filepath: string): Promise<string> {
  const { promises: fsPromises } = getFs()

  // Retry on ENOENT since files may not be immediately accessible after writes
  // Windows needs more retries due to slower filesystem operations
  const maxRetries = process.platform === 'win32' ? 5 : 1
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fsPromises.readFile(filepath, 'utf8')
    } catch (err) {
      const isLastAttempt = attempt === maxRetries
      const isEnoent =
        err instanceof Error && 'code' in err && err.code === 'ENOENT'

      // Only retry ENOENT and not on last attempt
      if (!isEnoent || isLastAttempt) {
        throw err
      }

      // Wait before retry with exponential backoff
      // Windows: 50ms, 100ms, 150ms, 200ms, 250ms (total 750ms + attempts)
      // Others: 20ms
      const delay = process.platform === 'win32' ? 50 * (attempt + 1) : 20
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay)
    }
  }

  // This line should never be reached but TypeScript requires it
  throw new Error('Unreachable code')
}

/**
 * Get the EditableJson class for JSON file manipulation.
 *
 * @example
 * ```ts
 * import { getEditableJsonClass } from '@socketsecurity/lib/json'
 *
 * const EditableJson = getEditableJsonClass<MyConfigType>()
 * const config = await EditableJson.load('./config.json')
 * config.update({ someField: 'newValue' })
 * await config.save({ sort: true })
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getEditableJsonClass<
  T = Record<string, unknown>,
>(): EditableJsonConstructor<T> {
  if (_EditableJsonClass === undefined) {
    _EditableJsonClass = class EditableJson<T = Record<string, unknown>>
      implements EditableJsonInstance<T>
    {
      _canSave = true
      _content: T = {} as T
      _path: string | undefined = undefined
      _readFileContent = ''
      _readFileJson: unknown = undefined

      get content(): Readonly<T> {
        return this._content
      }

      get filename(): string {
        const path = this._path
        if (!path) {
          return ''
        }
        return path
      }

      get path(): string | undefined {
        return this._path
      }

      static async create<T = Record<string, unknown>>(
        path: string,
        opts: EditableJsonOptions<T> = {},
      ): Promise<EditableJsonInstance<T>> {
        const instance = new EditableJson<T>()
        instance.create(path)
        return opts.data ? instance.update(opts.data) : instance
      }

      static async load<T = Record<string, unknown>>(
        path: string,
        opts: EditableJsonOptions<T> = {},
      ): Promise<EditableJsonInstance<T>> {
        const instance = new EditableJson<T>()
        // Avoid try/catch if we aren't going to create
        if (!opts.create) {
          return await instance.load(path)
        }
        try {
          return await instance.load(path)
        } catch (err: unknown) {
          if (
            !(err as Error).message.includes('ENOENT') &&
            !(err as Error).message.includes('no such file')
          ) {
            throw err
          }
          return instance.create(path)
        }
      }

      create(path: string): this {
        this._path = path
        this._content = {} as T
        this._canSave = true
        return this
      }

      fromContent(data: unknown): this {
        this._content = data as T
        this._canSave = false
        return this
      }

      fromJSON(data: string): this {
        const parsed = parseJson(data) as T & Record<symbol, unknown>
        // Extract and preserve formatting metadata
        const indent = detectIndent(data)
        const newline = detectNewline(data)

        // Store formatting metadata using symbols
        ;(parsed as Record<symbol, unknown>)[identSymbol] = indent
        ;(parsed as Record<symbol, unknown>)[newlineSymbol] = newline

        this._content = parsed as T
        return this
      }

      async load(path: string, create?: boolean): Promise<this> {
        this._path = path
        let parseErr: unknown
        try {
          this._readFileContent = await readFile(this.filename)
        } catch (err) {
          if (!create) {
            throw err
          }
          parseErr = err
        }
        if (parseErr) {
          throw parseErr
        }
        this.fromJSON(this._readFileContent)
        // Add AFTER fromJSON is called in case it errors.
        this._readFileJson = parseJson(this._readFileContent)
        return this
      }

      update(content: Partial<T>): this {
        this._content = {
          ...this._content,
          ...content,
        } as T
        return this
      }

      async save(options?: EditableJsonSaveOptions): Promise<boolean> {
        if (!this._canSave || this.content === undefined) {
          throw new Error('No file path to save to')
        }

        // Check if save is needed
        if (
          !shouldSaveUtil(
            this.content as Record<string | symbol, unknown>,
            this._readFileJson as Record<string | symbol, unknown>,
            this._readFileContent,
            options,
          )
        ) {
          return false
        }

        // Get content and formatting
        const content = stripFormattingSymbols(
          this.content as Record<string | symbol, unknown>,
        )
        const sortedContent = options?.sort ? sortKeys(content) : content
        const formatting = getFormattingFromContent(
          this.content as Record<string | symbol, unknown>,
        )

        // Generate file content
        const fileContent = stringifyWithFormatting(sortedContent, formatting)

        // Save to disk with retry logic for Windows file locking issues
        await retryWrite(this.filename, fileContent)
        this._readFileContent = fileContent
        this._readFileJson = parseJson(fileContent)
        return true
      }

      saveSync(options?: EditableJsonSaveOptions): boolean {
        if (!this._canSave || this.content === undefined) {
          throw new Error('No file path to save to')
        }

        // Check if save is needed
        if (
          !shouldSaveUtil(
            this.content as Record<string | symbol, unknown>,
            this._readFileJson as Record<string | symbol, unknown>,
            this._readFileContent,
            options,
          )
        ) {
          return false
        }

        // Get content and formatting
        const content = stripFormattingSymbols(
          this.content as Record<string | symbol, unknown>,
        )
        const sortedContent = options?.sort ? sortKeys(content) : content
        const formatting = getFormattingFromContent(
          this.content as Record<string | symbol, unknown>,
        )

        // Generate file content
        const fileContent = stringifyWithFormatting(sortedContent, formatting)

        // Save to disk
        const fs = getFs()
        fs.writeFileSync(this.filename, fileContent)
        this._readFileContent = fileContent
        this._readFileJson = parseJson(fileContent)
        return true
      }

      willSave(options?: EditableJsonSaveOptions): boolean {
        if (!this._canSave || this.content === undefined) {
          return false
        }

        return shouldSaveUtil(
          this.content as Record<string | symbol, unknown>,
          this._readFileJson as Record<string | symbol, unknown>,
          this._readFileContent,
          options,
        )
      }
    } as EditableJsonConstructor
  }
  return _EditableJsonClass as EditableJsonConstructor<T>
}

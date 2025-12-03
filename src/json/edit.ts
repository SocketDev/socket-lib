/**
 * @fileoverview Editable JSON file manipulation with formatting preservation.
 */

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
 * Parse JSON content and extract formatting metadata.
 * @private
 */
function parseJson(content: string): unknown {
  return JSONParse(content)
}

/**
 * Read file content from disk.
 * @private
 */
async function readFile(filepath: string): Promise<string> {
  const { promises: fsPromises } = getFs()
  return await fsPromises.readFile(filepath, 'utf8')
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

        // Save to disk
        const { promises: fsPromises } = getFs()
        await fsPromises.writeFile(this.filename, fileContent)
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

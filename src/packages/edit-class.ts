/**
 * @fileoverview The `EditablePackageJson` class factory.
 *
 * Split out of `packages/edit.ts` for size hygiene. Wraps
 * `@npmcli/package-json` with Socket-specific knobs: path tracking,
 * a `_canSave` guard for content-only instances, async + sync save
 * paths that honor `EditablePackageJsonOptions` formatting.
 *
 *   - `getEditablePackageJsonClass` — lazy class accessor (Webpack-safe)
 */

// @ts-expect-error - external vendored module
import EditablePackageJsonBase from '../external/@npmcli/package-json'
// @ts-expect-error - external vendored module
import { parse, read } from '../external/@npmcli/package-json/lib/read-package'
// @ts-expect-error - external vendored module
import { packageSort } from '../external/@npmcli/package-json/lib/sort'
import {
  getFormattingFromContent,
  shouldSave as shouldSaveUtil,
  stringifyWithFormatting,
  stripFormattingSymbols,
} from '../json/format'

import { ErrorCtor } from '../primordials/error'

import { JSONStringify } from '../primordials/json'

import { StringPrototypeEndsWith } from '../primordials/string'

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import { getNodeUtil } from '../node/util'

import type {
  EditablePackageJsonOptions,
  NormalizeOptions,
  PackageJson,
  SaveOptions,
} from './types'

import type { EditablePackageJsonInstance } from './edit'

/**
 * Private constructor interface for the lazily-built
 * `EditablePackageJson` class. Not exported because consumers go
 * through `getEditablePackageJsonClass()`.
 */
interface EditablePackageJsonConstructor {
  new (): EditablePackageJsonInstance
  fixSteps: unknown[]
  normalizeSteps: unknown[]
  prepareSteps: unknown[]
  create(
    path: string,
    opts?: EditablePackageJsonOptions,
  ): Promise<EditablePackageJsonInstance>
  fix(path: string, opts?: unknown): Promise<EditablePackageJsonInstance>
  load(
    path: string,
    opts?: EditablePackageJsonOptions,
  ): Promise<EditablePackageJsonInstance>
  normalize(
    path: string,
    opts?: NormalizeOptions,
  ): Promise<EditablePackageJsonInstance>
  prepare(path: string, opts?: unknown): Promise<EditablePackageJsonInstance>
}

let _EditablePackageJsonClass: EditablePackageJsonConstructor | undefined

/**
 * Get the EditablePackageJson class for package.json manipulation.
 *
 * @example
 * ```typescript
 * const EditablePackageJson = getEditablePackageJsonClass()
 * const pkg = await EditablePackageJson.load('/tmp/my-project')
 * console.log(pkg.content.name)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getEditablePackageJsonClass(): EditablePackageJsonConstructor {
  if (_EditablePackageJsonClass === undefined) {
    // module is imported at the top
    _EditablePackageJsonClass =
      class EditablePackageJson extends (EditablePackageJsonBase as EditablePackageJsonConstructor) {
        static override fixSteps = EditablePackageJsonBase.fixSteps
        static override normalizeSteps = EditablePackageJsonBase.normalizeSteps
        static override prepareSteps = EditablePackageJsonBase.prepareSteps

        _canSave = true
        _path: string | undefined = undefined
        _readFileContent = ''
        _readFileJson: unknown = undefined

        override get content(): Readonly<PackageJson> {
          return super.content
        }

        get filename(): string {
          const path = this._path
          if (!path) {
            return ''
          }
          if (StringPrototypeEndsWith(path, 'package.json')) {
            return path
          }
          const nodePath = getNodePath()
          return nodePath.join(path, 'package.json')
        }

        static override async create(
          path: string,
          opts: EditablePackageJsonOptions = {},
        ) {
          const p =
            new (_EditablePackageJsonClass as EditablePackageJsonConstructor)()
          await p.create(path)
          return opts.data ? p.update(opts.data) : p
        }

        static override async fix(path: string, opts: unknown) {
          const p =
            new (_EditablePackageJsonClass as EditablePackageJsonConstructor)()
          await p.load(path, true)
          return await p.fix(opts)
        }

        static override async load(
          path: string,
          opts: EditablePackageJsonOptions = {},
        ) {
          const p =
            new (_EditablePackageJsonClass as EditablePackageJsonConstructor)()
          // Avoid try/catch if we aren't going to create
          if (!opts.create) {
            return await p.load(path)
          }
          try {
            return await p.load(path)
          } catch (err: unknown) {
            if (
              !(err as Error).message.startsWith('Could not read package.json')
            ) {
              throw err
            }
            return p.create(path)
          }
        }

        static override async normalize(path: string, opts: NormalizeOptions) {
          const p =
            new (_EditablePackageJsonClass as EditablePackageJsonConstructor)()
          await p.load(path)
          return await p.normalize(opts)
        }

        static override async prepare(path: string, opts: unknown) {
          const p =
            new (_EditablePackageJsonClass as EditablePackageJsonConstructor)()
          await p.load(path, true)
          return await p.prepare(opts)
        }

        override create(path: string) {
          super.create(path)
          ;(this as unknown as { _path: string })._path = path
          return this
        }

        override async fix(opts: unknown = {}) {
          await super.fix(opts)
          return this
        }

        override fromContent(data: unknown) {
          super.fromContent(data)
          ;(this as unknown as { _canSave: boolean })._canSave = false
          return this
        }

        override fromJSON(data: string): this {
          super.fromJSON(data)
          return this
        }

        override async load(path: string, create?: boolean): Promise<this> {
          this._path = path
          const { promises: fsPromises } = getNodeFs()
          let parseErr: unknown
          try {
            this._readFileContent = await read(this.filename)
          } catch (e) {
            if (!create) {
              throw e
            }
            parseErr = e
          }
          if (parseErr) {
            const nodePath = getNodePath()
            const indexFile = nodePath.resolve(this.path || '', 'index.js')
            let indexFileContent: string
            try {
              indexFileContent = await fsPromises.readFile(indexFile, 'utf8')
            } catch {
              throw parseErr
            }
            try {
              this.fromContent(indexFileContent)
            } catch {
              throw parseErr
            }
            // This wasn't a package.json so prevent saving
            this._canSave = false
            return this
          }
          this.fromJSON(this._readFileContent)
          // Add AFTER fromJSON is called in case it errors.
          this._readFileJson = parse(this._readFileContent)
          return this
        }

        override async normalize(opts: NormalizeOptions = {}): Promise<this> {
          await super.normalize(opts)
          return this
        }

        get path() {
          return this._path
        }

        override async prepare(opts: unknown = {}): Promise<this> {
          await super.prepare(opts)
          return this
        }

        override async save(options?: SaveOptions): Promise<boolean> {
          if (!this._canSave || this.content === undefined) {
            throw new ErrorCtor('No package.json to save to')
          }

          // Check if save is needed, using packageSort for package.json
          if (
            !shouldSaveUtil(
              this.content as Record<string | symbol, unknown>,
              this._readFileJson as Record<string | symbol, unknown>,
              this._readFileContent,
              { ...options, sortFn: options?.sort ? packageSort : undefined },
            )
          ) {
            return false
          }

          // Get content and formatting
          const content = stripFormattingSymbols(
            this.content as Record<string | symbol, unknown>,
          )
          const sortedContent = options?.sort ? packageSort(content) : content
          const formatting = getFormattingFromContent(
            this.content as Record<string | symbol, unknown>,
          )

          // Generate file content
          const fileContent = stringifyWithFormatting(sortedContent, formatting)

          // Save to disk
          const { promises: fsPromises } = getNodeFs()
          await fsPromises.writeFile(this.filename, fileContent)
          this._readFileContent = fileContent
          this._readFileJson = parse(fileContent)
          return true
        }

        override saveSync(options?: SaveOptions): boolean {
          if (!this._canSave || this.content === undefined) {
            throw new ErrorCtor('No package.json to save to')
          }
          const { ignoreWhitespace = false, sort = false } = {
            __proto__: null,
            ...options,
          } as SaveOptions
          const {
            [Symbol.for('indent')]: indent,
            [Symbol.for('newline')]: newline,
            ...rest
          } = this.content as Record<string | symbol, unknown>
          const content = sort ? packageSort(rest) : rest

          if (
            ignoreWhitespace &&
            getNodeUtil().isDeepStrictEqual(content, this._readFileJson)
          ) {
            return false
          }

          const format =
            indent === undefined || indent === null
              ? '  '
              : (indent as string | number)
          const eol =
            newline === undefined || newline === null
              ? '\n'
              : (newline as string)
          const fileContent = `${JSONStringify(
            content,
            undefined,
            format,
          )}\n`.replace(/\n/g, eol)

          if (
            !ignoreWhitespace &&
            fileContent.trim() === this._readFileContent.trim()
          ) {
            return false
          }

          const fs = getNodeFs()
          fs.writeFileSync(this.filename, fileContent)
          this._readFileContent = fileContent
          this._readFileJson = parse(fileContent)
          return true
        }

        override update(content: PackageJson): this {
          super.update(content)
          return this
        }

        override willSave(options?: SaveOptions): boolean {
          const { ignoreWhitespace = false, sort = false } = {
            __proto__: null,
            ...options,
          } as SaveOptions as SaveOptions
          if (!this._canSave || this.content === undefined) {
            return false
          }
          const {
            [Symbol.for('indent')]: indent,
            [Symbol.for('newline')]: newline,
            ...rest
          } = this.content as Record<string | symbol, unknown>
          const content = sort ? packageSort(rest) : rest

          if (
            ignoreWhitespace &&
            getNodeUtil().isDeepStrictEqual(content, this._readFileJson)
          ) {
            return false
          }

          const format =
            indent === undefined || indent === null
              ? '  '
              : (indent as string | number)
          const eol =
            newline === undefined || newline === null
              ? '\n'
              : (newline as string)
          const fileContent = `${JSONStringify(
            content,
            undefined,
            format,
          )}\n`.replace(/\n/g, eol)

          if (
            !ignoreWhitespace &&
            fileContent.trim() === this._readFileContent.trim()
          ) {
            return false
          }
          return true
        }
      } as EditablePackageJsonConstructor
  }
  return _EditablePackageJsonClass as EditablePackageJsonConstructor
}

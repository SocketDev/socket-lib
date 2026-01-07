import type * as checkbox from '@inquirer/checkbox'
import type * as confirm from '@inquirer/confirm'
import type * as input from '@inquirer/input'
import type * as password from '@inquirer/password'
import type * as search from '@inquirer/search'
import type * as select from '@inquirer/select'

export interface InquirerPack {
  checkbox: typeof checkbox
  confirm: typeof confirm
  input: typeof input
  password: typeof password
  search: typeof search
  select: typeof select
}

declare const inquirerPack: InquirerPack
export default inquirerPack

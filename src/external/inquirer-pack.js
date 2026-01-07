'use strict'

// inquirer-pack: Bundle all @inquirer packages together.
// These packages share dependencies and are commonly used together for interactive CLI prompts.

const checkbox = require('@inquirer/checkbox')
const confirm = require('@inquirer/confirm')
const input = require('@inquirer/input')
const password = require('@inquirer/password')
const search = require('@inquirer/search')
const select = require('@inquirer/select')

module.exports = {
  checkbox,
  confirm,
  input,
  password,
  search,
  select,
}

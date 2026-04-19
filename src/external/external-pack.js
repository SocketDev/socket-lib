'use strict'

// external-pack: Bundle shared dependencies and @inquirer packages together.
// This consolidates: signal-exit, supports-color, has-flag, yoctocolors-cjs, @inquirer/*.

const signalExit = require('signal-exit')
const supportsColor = require('supports-color')
const hasFlag = require('has-flag')
const yoctocolorsCjs = require('yoctocolors-cjs')

// @inquirer packages - commonly used together for interactive CLI prompts.
const checkbox = require('@inquirer/checkbox')
const confirm = require('@inquirer/confirm')
const input = require('@inquirer/input')
const password = require('@inquirer/password')
const search = require('@inquirer/search')
const select = require('@inquirer/select')

module.exports = {
  checkbox,
  confirm,
  hasFlag,
  input,
  password,
  search,
  select,
  signalExit,
  supportsColor,
  yoctocolorsCjs,
}

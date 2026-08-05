'use strict'

// external-pack: Bundle shared dependencies and @inquirer packages together.
// This consolidates: signal-exit, supports-color, has-flag, terminal-link,
// yoctocolors-cjs, @inquirer/*.
//
// terminal-link lives HERE rather than in its own bundle: it reaches
// supports-color and has-flag through supports-hyperlinks, and a separate
// bundle gave it private copies of both.

const signalExit = require('signal-exit')
const supportsColor = require('supports-color')
const hasFlag = require('has-flag')
const terminalLink = require('terminal-link')
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
  terminalLink,
  yoctocolorsCjs,
}

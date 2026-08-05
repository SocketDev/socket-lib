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
// has-flag is ESM-only under the workspace override (5.0.1): in a raw-src
// context require() hands back the module namespace, so unwrap .default once
// here rather than at every consumer.
const hasFlagNs = require('has-flag')
const hasFlag = hasFlagNs.default || hasFlagNs

// terminal-link is LAZY, unlike everything else here. Its CJS dep chain
// (supports-hyperlinks@2 -> require('has-flag')) collides with the workspace
// overrides pinning has-flag@5 / supports-color@10, which are ESM-only: the
// CJS require gets a namespace and calls it. An EAGER require here took down
// every src-context module that loads this pack for colors or logging — 215
// tests across 26 files. The bundle never sees this (build-externals stubs
// swap in CJS ports of both packages), so the breakage lived ONLY where tests
// import from: src.
let _terminalLink
function getTerminalLink() {
  if (_terminalLink === undefined) {
    const ns = require('terminal-link')
    _terminalLink = ns.default || ns
  }
  return _terminalLink
}
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
  getTerminalLink,
  hasFlag,
  input,
  password,
  search,
  select,
  signalExit,
  supportsColor,
  yoctocolorsCjs,
}

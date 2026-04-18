'use strict'

// external-pack: Bundle shared dependencies together.
// This consolidates: signal-exit, supports-color, has-flag, yoctocolors-cjs.

const signalExit = require('signal-exit')
const supportsColor = require('supports-color')
const hasFlag = require('has-flag')
const yoctocolorsCjs = require('yoctocolors-cjs')

module.exports = {
  hasFlag,
  signalExit,
  supportsColor,
  yoctocolorsCjs,
}

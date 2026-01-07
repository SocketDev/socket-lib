'use strict'

// spdx-pack: Bundle spdx-correct and spdx-expression-parse together.
// These packages share dependencies and are commonly used together for SPDX license validation.

const spdxCorrect = require('spdx-correct')
const spdxExpressionParse = require('spdx-expression-parse')

module.exports = {
  spdxCorrect,
  spdxExpressionParse,
}

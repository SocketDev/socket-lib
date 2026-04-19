/**
 * Arborist AuditReport stub.
 *
 * audit-report.js is eagerly required by arborist/index.js and reify.js
 * but AuditReport.load is only called from arb.audit() (never used by
 * us) and from reify's [_submitQuickAudit] which is gated on
 * `this.options.audit !== false`. We always pass `audit: false`, so
 * load() is unreachable.
 *
 * We provide a no-op `load` that returns null so the eager require is
 * satisfied and any unexpected call paths fail loudly.
 */
'use strict'

class AuditReport {
  static async load() {
    return null
  }
  constructor() {
    throw new Error(
      'socket-lib bundle: AuditReport is stubbed — ' +
        'construct path is unreachable when audit:false is set.',
    )
  }
}

module.exports = AuditReport

/**
 * @npmcli/node-gyp stub.
 *
 * Arborist's rebuild.js calls isNodeGypPackage(node.path) to detect
 * native-module packages that need a synthesized install script. The
 * synthesized script only runs when !ignoreScripts, and we always pass
 * ignoreScripts: true in our SafeArborist overrides. So we always
 * report "not a gyp package" — the detection result is consumed by an
 * `isGyp && ...` branch that ends up skipped.
 *
 * Also exports defaultGypInstallScript so the destructure at the top
 * of rebuild.js doesn't fail; the value is never read because isGyp
 * stays false.
 */
'use strict'

module.exports = {
  isNodeGypPackage: async () => false,
  defaultGypInstallScript: '',
}

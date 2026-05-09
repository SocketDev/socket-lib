/**
 * @fileoverview Yarn family barrel — Classic + Berry + ZPM.
 *
 * The three Yarn variants share a common CLI shape today, so all three
 * dirs currently export the same execYarn from yarnpkg/yarn. As
 * version-specific behavior diverges, each dir overrides locally.
 *
 * Repos:
 * - https://github.com/yarnpkg/yarn   (Classic, <2)
 * - https://github.com/yarnpkg/berry  (>=2 <6)
 * - https://github.com/yarnpkg/zpm    (>=6, Rust)
 */

export { execYarn } from './yarn/exec'

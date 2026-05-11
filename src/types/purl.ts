/**
 * @fileoverview Runtime `PURL_Type` mapping — uppercase key /
 * lowercase value pairs covering every PURL package ecosystem
 * (npm, pypi, cargo, etc.) recognized by Socket. Mirrors the
 * `PURLString` union in `./types`.
 */

// Based on SocketPURL_Type from socket-sdk-js
export const PURL_Type = {
  ALPM: 'alpm',
  APK: 'apk',
  BITBUCKET: 'bitbucket',
  COCOAPODS: 'cocoapods',
  CARGO: 'cargo',
  CHROME: 'chrome',
  COMPOSER: 'composer',
  CONAN: 'conan',
  CONDA: 'conda',
  CRAN: 'cran',
  DEB: 'deb',
  DOCKER: 'docker',
  GEM: 'gem',
  GENERIC: 'generic',
  GITHUB: 'github',
  GOLANG: 'golang',
  HACKAGE: 'hackage',
  HEX: 'hex',
  HUGGINGFACE: 'huggingface',
  MAVEN: 'maven',
  MLFLOW: 'mlflow',
  NPM: 'npm',
  NUGET: 'nuget',
  OCI: 'oci',
  PUB: 'pub',
  PYPI: 'pypi',
  QPKG: 'qpkg',
  RPM: 'rpm',
  SWID: 'swid',
  SWIFT: 'swift',
  VCS: 'vcs',
  VSCODE: 'vscode',
} as const

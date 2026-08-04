# npm cmd-shim generated shim formats

`resolveBinPathSync` reads the shims npm writes into `node_modules/.bin` and
extracts the real script path out of them with a regex. That only works if the
regex matches the exact text npm generates, so this note keeps a verbatim copy
of the shim shapes the parser targets.

Source: https://github.com/npm/cmd-shim/blob/v7.0.0/lib/index.js

When bumping the pinned cmd-shim version, regenerate a shim and diff it against
the blocks below. A wording change upstream does not break the build; it makes
the regex silently return an empty path, and the failure surfaces much later as
a binary that cannot be found.

## PowerShell (`bin.ps1`)

Generated at
https://github.com/npm/cmd-shim/blob/v7.0.0/lib/index.js#L192:

```powershell
#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent

$exe=""
if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {
  # Fix case when both the Windows and Linux builds of Node
  # are installed in the same directory
  $exe=".exe"
}
$ret=0
if (Test-Path "$basedir/node$exe") {
  # Support pipeline input
  if ($MyInvocation.ExpectingInput) {
    $input | & "$basedir/node$exe"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" $args
  } else {
    & "$basedir/node$exe"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" $args
  }
  $ret=$LASTEXITCODE
} else {
  # Support pipeline input
  if ($MyInvocation.ExpectingInput) {
    $input | & "node$exe"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" $args
  } else {
    & "node$exe"  "$basedir/../<PACKAGE_NAME>/path/to/bin.js" $args
  }
  $ret=$LASTEXITCODE
}
```

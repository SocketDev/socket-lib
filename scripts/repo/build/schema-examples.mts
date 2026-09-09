export function normalizePrimSchemaExamples(code: string): string {
  return code.replace(
    // Match only this description call, consuming escaped quotes inside its string.
    /\.describe\("Glob patterns or absolute paths of CLAUDE\.md files to exclude from loading\.(?:[^"\\]|\\.)*"\)/g,
    description =>
      description.replace(
        /(?<=Examples: \\")\/home\/user\/monorepo\/CLAUDE\.md(?=\\")/g,
        '/workspace/example/CLAUDE.md',
      ),
  )
}

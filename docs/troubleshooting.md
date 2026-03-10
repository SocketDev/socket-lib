# Troubleshooting

Common issues and solutions when using @socketsecurity/lib.

## Installation Issues

### Module not found after installation

**Problem:** Cannot find module '@socketsecurity/lib/...' after installation.

**Solution:**
1. Verify the package is installed:
   ```bash
   npm list @socketsecurity/lib
   ```

2. Check your import path uses the correct export:
   ```typescript
   // Correct
   import { Spinner } from '@socketsecurity/lib/spinner'

   // Wrong
   import { Spinner } from '@socketsecurity/lib'
   ```

3. Clear your package manager cache and reinstall:
   ```bash
   # npm
   rm -rf node_modules package-lock.json
   npm install

   # pnpm
   rm -rf node_modules pnpm-lock.yaml
   pnpm install

   # yarn
   rm -rf node_modules yarn.lock
   yarn install
   ```

### TypeScript cannot find types

**Problem:** TypeScript reports "Could not find a declaration file for module '@socketsecurity/lib/...'"

**Solution:**
1. Ensure you're using Node.js 22+ (required by the library)

2. Check your `tsconfig.json` has proper module resolution:
   ```json
   {
     "compilerOptions": {
       "moduleResolution": "node",
       "esModuleInterop": true
     }
   }
   ```

3. Restart your TypeScript server in your editor

## Spinner Issues

### Spinner not animating

**Problem:** Spinner text appears but doesn't animate.

**Solution:**
Make sure you called `.start()`:
```typescript
const spinner = Spinner({ text: 'Loading...' })
spinner.start()  // Required!
```

### Spinner leaves visual artifacts

**Problem:** Text remnants left after spinner stops.

**Solution:**
Use the `*AndStop` methods:
```typescript
// Good
spinner.successAndStop('Done')

// Avoid
spinner.success('Done')
spinner.stop()
```

### Spinner conflicts with command output

**Problem:** Spinner mixes with command stdout/stderr.

**Solution:**
Pass the spinner to spawn options:
```typescript
const spinner = Spinner({ text: 'Running command...' })
spinner.start()

await spawn('command', [], {
  stdio: 'inherit',  // Spinner auto-pauses
  spinner
})

spinner.successAndStop('Complete')
```

## File System Issues

### ENOENT: no such file or directory

**Problem:** File or directory doesn't exist.

**Solutions:**

For missing files:
```typescript
// Use safe version that returns undefined
const content = await safeReadFile('./optional-file.txt')
if (content === undefined) {
  // Handle missing file
}
```

For missing directories:
```typescript
// Create directory before writing
await safeMkdir('./path/to/dir')
await writeJson('./path/to/dir/file.json', data)
```

### EACCES: permission denied

**Problem:** Insufficient permissions to read/write.

**Solutions:**

Check file permissions:
```bash
# Unix/Linux/macOS
ls -la filename

# Fix permissions
chmod 644 filename  # For files
chmod 755 dirname   # For directories
```

For `safeDelete()`, ensure parent directory is writable:
```bash
chmod 755 parent-directory
```

### Path issues on Windows

**Problem:** Paths with backslashes don't work.

**Solution:**
Always use `path.join()` for cross-platform paths:
```typescript
import path from 'node:path'

// Good
const filePath = path.join(dir, 'subdir', 'file.txt')

// Bad (fails on Windows)
const filePath = `${dir}/subdir/file.txt`
```

### JSON parse errors

**Problem:** `readJson()` throws SyntaxError.

**Solutions:**

1. Use `throws: false` to handle gracefully:
   ```typescript
   const data = await readJson('./config.json', { throws: false })
   if (data === undefined) {
     console.log('Using defaults')
   }
   ```

2. Validate JSON syntax:
   ```bash
   # Check JSON is valid
   cat file.json | jq .
   ```

3. Common JSON errors:
   - Trailing commas (not allowed in JSON)
   - Single quotes instead of double quotes
   - Missing closing brackets/braces

## HTTP/Network Issues

### ENOTFOUND: DNS lookup failed

**Problem:** Cannot resolve hostname.

**Solutions:**
1. Check the URL is correct
2. Verify network connection:
   ```bash
   ping example.com
   ```
3. Check DNS:
   ```bash
   nslookup example.com
   ```
4. Try a different DNS server (8.8.8.8 or 1.1.1.1)

### ECONNREFUSED: Connection refused

**Problem:** Server not accepting connections.

**Solutions:**
1. Verify the server is running
2. Check the port is correct
3. Ensure firewall isn't blocking
4. Try accessing in browser first

### ETIMEDOUT: Request timed out

**Problem:** Request exceeded timeout.

**Solutions:**
```typescript
// Increase timeout
await httpJson('https://api.example.com/slow', {
  timeout: 60000  // 1 minute instead of 30s default
})

// Add retries for unreliable networks
await httpJson('https://api.example.com/data', {
  retries: 3,
  retryDelay: 2000
})
```

### Too many redirects

**Problem:** Exceeded `maxRedirects` limit.

**Solutions:**
```typescript
// Increase limit if redirects are legitimate
await httpDownload(url, dest, {
  maxRedirects: 10
})

// Or disable redirects to debug
const response = await httpRequest(url, {
  followRedirects: false
})
console.log('Redirect location:', response.headers['location'])
```

### SSL certificate errors

**Problem:** Self-signed certificates or certificate validation errors.

**Solution:**
For development only (NOT production):
```typescript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
```

Better solution: Install proper SSL certificates or use a certificate authority.

## Process/Spawn Issues

### Command not found

**Problem:** ENOENT error when spawning.

**Solutions:**

1. Check command exists in PATH:
   ```bash
   # Unix
   which command-name

   # Windows
   where command-name
   ```

2. Use full path:
   ```typescript
   await spawn('/usr/local/bin/command', [])
   ```

3. For Windows `.cmd`/`.bat` files:
   ```typescript
   await spawn('command.cmd', [], {
     shell: true  // Required on Windows
   })
   ```

### Process hangs forever

**Problem:** Spawn never resolves.

**Solutions:**

1. Add timeout:
   ```typescript
   await spawn('command', [], {
     timeout: 30000  // Kill after 30s
   })
   ```

2. Check stdio configuration:
   ```typescript
   // If command waits for input, ignore stdin
   await spawn('command', [], {
     stdio: ['ignore', 'pipe', 'pipe']
   })
   ```

### Wrong working directory

**Problem:** Command can't find files.

**Solution:**
Always use `cwd` option:
```typescript
await spawn('npm', ['test'], {
  cwd: '/absolute/path/to/project'
})
```

Never use `process.chdir()` - it's dangerous in Node.js.

### Environment variables not working

**Problem:** Command doesn't see expected env vars.

**Solution:**
Merge with process.env:
```typescript
await spawn('command', [], {
  env: {
    ...process.env,
    CUSTOM_VAR: 'value'
  }
})
```

## Environment Detection Issues

### CI not detected

**Problem:** `getCI()` returns false in CI.

**Solutions:**
1. Check CI sets the `CI` variable:
   ```bash
   echo $CI
   ```

2. Manually set in CI config:
   ```yaml
   # GitHub Actions
   env:
     CI: true

   # GitLab CI
   variables:
     CI: "true"
   ```

3. Most major CI systems (GitHub Actions, GitLab CI, CircleCI, Travis CI) automatically set `CI=true`

### Environment variable not found

**Problem:** Getter returns `undefined` when var should be set.

**Solutions:**
1. Verify variable is set:
   ```bash
   echo $VAR_NAME
   ```

2. Ensure it's exported:
   ```bash
   export VAR_NAME=value
   ```

3. Check spelling and case

## TypeScript Issues

### Type errors with unknown

**Problem:** TypeScript complains about `unknown` types.

**Solution:**
Use type assertions or generics:
```typescript
// With generic
const data = await httpJson<MyType>('https://api.example.com/data')

// With type assertion
const data = await httpJson('https://api.example.com/data') as MyType

// With validation
const data = await httpJson('https://api.example.com/data')
if (isMyType(data)) {
  // Now TypeScript knows the type
}
```

### Module resolution errors

**Problem:** Cannot resolve module paths.

**Solution:**
Check your `tsconfig.json`:
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

## Performance Issues

### Slow file operations

**Problem:** Reading/writing many files is slow.

**Solutions:**

1. Use parallel operations:
   ```typescript
   // Slow (sequential)
   for (const file of files) {
     await readFileUtf8(file)
   }

   // Fast (parallel)
   await Promise.all(
     files.map(file => readFileUtf8(file))
   )
   ```

2. Limit concurrency for very large sets:
   ```typescript
   import { PromiseQueue } from '@socketsecurity/lib/promise-queue'

   const queue = new PromiseQueue(10)
   await Promise.all(
     files.map(file => queue.add(() => readFileUtf8(file)))
   )
   ```

### Slow HTTP requests

**Problem:** Requests take too long.

**Solutions:**

1. Enable retries with exponential backoff:
   ```typescript
   await httpJson(url, {
     retries: 3,
     retryDelay: 1000
   })
   ```

2. Reduce timeout for faster failures:
   ```typescript
   await httpJson(url, {
     timeout: 5000  // Fail fast after 5s
   })
   ```

3. Use connection pooling (automatically handled by Node.js http agent)

## Getting More Help

If your issue isn't covered here:

1. **Check the API documentation** for your specific function
2. **Review the examples** in `/docs/examples.md`
3. **Search existing GitHub issues**: https://github.com/SocketDev/socket-lib/issues
4. **Create a new issue** with:
   - Node.js version (`node --version`)
   - Package version
   - Minimal code to reproduce
   - Full error message and stack trace
   - Operating system

## Common Error Messages

### "Cannot find module"
- Check import path is correct
- Verify package is installed
- Clear cache and reinstall

### "Permission denied"
- Check file/directory permissions
- Ensure you have write access
- Run with appropriate user permissions

### "ENOENT: no such file or directory"
- Verify path exists
- Check for typos in path
- Use absolute paths or `path.join()`

### "command failed"
- Check command exists in PATH
- Verify arguments are correct
- Review stderr for error details

### "JSON parse error"
- Validate JSON syntax
- Check for trailing commas
- Ensure file contains valid JSON

### "Too many redirects"
- Check for redirect loops
- Increase `maxRedirects` if legitimate
- Verify URL is correct

### "Request timeout"
- Increase timeout value
- Add retry logic
- Check network connection

# HTTP Utilities

Make HTTP/HTTPS requests, download files, and interact with APIs using Node.js native modules with retry logic and redirect support.

## When to Use HTTP Utilities

- Making API requests (REST, JSON APIs)
- Downloading files from URLs
- Fetching web pages or text content
- Uploading data to servers
- Implementing retry logic for unreliable networks

## Quick Start

```typescript
import {
  httpJson,
  httpText,
  httpDownload,
} from '@socketsecurity/lib/http-request'

// Fetch JSON from an API
const data = await httpJson('https://api.example.com/users')

// Fetch text/HTML
const html = await httpText('https://example.com')

// Download a file
await httpDownload('https://example.com/file.zip', '/tmp/file.zip')
```

## API Reference

### httpJson()

**What it does:** Makes an HTTP request and parses the response as JSON.

**When to use:** Calling REST APIs, fetching JSON data, working with web services.

**Parameters:**

- `url` (string): The URL to request (http:// or https://)
- `options` (HttpRequestOptions): Request configuration

**Returns:** Promise<T> with parsed JSON (T defaults to `unknown`)

**Example:**

```typescript
import { httpJson } from '@socketsecurity/lib/http-request'

// Simple GET request
const data = await httpJson('https://api.example.com/data')
console.log(data)

// With type safety
interface User {
  id: number
  name: string
  email: string
}

const user = await httpJson<User>('https://api.example.com/user/123')
console.log(user.name, user.email)

// POST with JSON body
const result = await httpJson('https://api.example.com/users', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Alice',
    email: 'alice@example.com',
  }),
})

// With authentication and retries
const data = await httpJson('https://api.example.com/data', {
  headers: {
    Authorization: 'Bearer token123',
  },
  retries: 3,
  retryDelay: 1000,
  timeout: 10000,
})
```

**Common Pitfalls:**

- Non-2xx responses throw an error (check `response.ok` if using `httpRequest` directly)
- JSON parsing errors will throw - make sure the response is valid JSON
- Remember to `JSON.stringify()` the body when sending JSON data
- Headers automatically include `Accept: application/json` (can be overridden)

### httpText()

**What it does:** Makes an HTTP request and returns the response as UTF-8 text.

**When to use:** Fetching HTML pages, plain text files, or non-JSON API responses.

**Parameters:**

- `url` (string): The URL to request
- `options` (HttpRequestOptions): Request configuration

**Returns:** Promise<string>

**Example:**

```typescript
import { httpText } from '@socketsecurity/lib/http-request'

// Fetch HTML
const html = await httpText('https://example.com')
console.log(html.includes('<!DOCTYPE html>'))

// Fetch plain text
const readme = await httpText(
  'https://raw.githubusercontent.com/user/repo/main/README.md',
)

// POST text data
const result = await httpText('https://api.example.com/webhook', {
  method: 'POST',
  body: 'Plain text payload',
})

// With custom headers
const content = await httpText('https://example.com/data.txt', {
  headers: {
    Accept: 'text/html',
    'User-Agent': 'MyApp/1.0',
  },
})
```

**Common Pitfalls:**

- Non-2xx responses throw an error
- Binary content will be decoded as UTF-8 (use `httpRequest` + `.arrayBuffer()` for binary)

### httpRequest()

**What it does:** Makes an HTTP/HTTPS request with full control over the response.

**When to use:** When you need access to headers, status codes, or want to handle responses manually.

**Parameters:**

- `url` (string): The URL to request
- `options` (HttpRequestOptions): Request configuration

**Returns:** Promise<HttpResponse> with methods for accessing the response

**Example:**

```typescript
import { httpRequest } from '@socketsecurity/lib/http-request'

// Make a request
const response = await httpRequest('https://api.example.com/data')

// Access response properties
console.log('Status:', response.status)
console.log('Status Text:', response.statusText)
console.log('OK:', response.ok) // true for 2xx
console.log('Headers:', response.headers)

// Parse response body
const data = response.json()
// or
const text = response.text()
// or
const arrayBuffer = response.arrayBuffer()

// Handle non-2xx responses
const response = await httpRequest('https://api.example.com/might-fail')
if (!response.ok) {
  console.error(`Request failed: ${response.status} ${response.statusText}`)
  console.error('Error details:', response.text())
}

// POST with custom headers
const response = await httpRequest('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer token123',
  },
  body: JSON.stringify({ name: 'Alice' }),
})

// Don't follow redirects
const response = await httpRequest('https://example.com/redirect', {
  followRedirects: false,
})
console.log(response.status) // 301, 302, etc.
console.log(response.headers['location']) // Redirect target
```

**Response Methods:**

- `.json<T>()` - Parse as JSON (generic type T)
- `.text()` - Get as UTF-8 string
- `.arrayBuffer()` - Get as ArrayBuffer
- `.body` - Access raw Buffer directly

**Common Pitfalls:**

- Unlike `httpJson()` and `httpText()`, this doesn't throw on non-2xx responses
- Must call `.json()`, `.text()`, or `.arrayBuffer()` to access the body
- Each response method can only be called once (body is consumed)

### httpDownload()

**What it does:** Downloads a file from a URL to a local path with streaming and progress tracking.

**When to use:** Downloading large files, archives, installers, or any remote resource to disk.

**Parameters:**

- `url` (string): The URL to download from
- `destPath` (string): Absolute path where file should be saved
- `options` (HttpDownloadOptions): Download configuration

**Returns:** Promise<HttpDownloadResult> with `path` and `size`

**Example:**

```typescript
import { httpDownload } from '@socketsecurity/lib/http-request'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

// Simple download
const result = await httpDownload(
  'https://example.com/file.zip',
  '/tmp/file.zip',
)
console.log(`Downloaded ${result.size} bytes to ${result.path}`)

// Download from GitHub releases (handles redirects automatically)
await httpDownload(
  'https://github.com/org/repo/releases/download/v1.0.0/binary.tar.gz',
  '/tmp/binary.tar.gz',
)

// With progress callback
await httpDownload('https://example.com/large-file.zip', '/tmp/file.zip', {
  onProgress: (downloaded, total) => {
    const percent = ((downloaded / total) * 100).toFixed(1)
    console.log(`Progress: ${percent}% (${downloaded}/${total} bytes)`)
  },
})

// With logger progress (automatic progress logging)
const logger = getDefaultLogger()
await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
  logger,
  progressInterval: 10, // Log every 10%
})
// Output:
//   Progress: 10% (5.2 MB / 52.0 MB)
//   Progress: 20% (10.4 MB / 52.0 MB)
//   ...

// With retries and timeout
await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
  retries: 3,
  retryDelay: 2000,
  timeout: 300000, // 5 minutes
  headers: {
    Authorization: 'Bearer token123',
  },
})
```

**Common Pitfalls:**

- `destPath` must be an absolute path
- Parent directory must exist (create it first with `safeMkdir()`)
- Existing files at `destPath` will be overwritten
- Network errors will retry if `retries > 0`, but filesystem errors won't

## Request Options

All HTTP functions accept these common options:

### method

HTTP method to use.

```typescript
await httpJson('https://api.example.com/users', {
  method: 'POST', // 'GET', 'POST', 'PUT', 'DELETE', etc.
})
```

**Default:** `'GET'`

### headers

Custom HTTP headers.

```typescript
await httpJson('https://api.example.com/data', {
  headers: {
    Authorization: 'Bearer token123',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})
```

**Default:** Includes `User-Agent: socket-registry/1.0`

### body

Request body (string or Buffer).

```typescript
// JSON body
await httpJson('https://api.example.com/users', {
  method: 'POST',
  body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
})

// Text body
await httpText('https://api.example.com/webhook', {
  method: 'POST',
  body: 'Plain text data',
})

// Binary body
const buffer = Buffer.from([0x00, 0x01, 0x02])
await httpRequest('https://api.example.com/upload', {
  method: 'POST',
  body: buffer,
})
```

### timeout

Request timeout in milliseconds.

```typescript
await httpJson('https://api.example.com/data', {
  timeout: 60000, // 1 minute
})
```

**Default:**

- `30000` (30 seconds) for requests
- `120000` (2 minutes) for downloads

### retries

Number of retry attempts for failed requests.

```typescript
await httpJson('https://api.example.com/data', {
  retries: 3, // Try up to 3 times
  retryDelay: 1000, // Wait 1s, then 2s, then 4s (exponential backoff)
})
```

**Default:** `0` (no retries)

### retryDelay

Initial delay in milliseconds before first retry. Subsequent retries use exponential backoff.

```typescript
await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
  retries: 3,
  retryDelay: 2000, // 2s, then 4s, then 8s
})
```

**Default:** `1000` (1 second)

### followRedirects

Whether to automatically follow HTTP redirects (3xx status codes).

```typescript
// Follow redirects (default)
await httpDownload(
  'https://github.com/org/repo/releases/download/v1.0.0/file.zip',
  '/tmp/file.zip',
)

// Don't follow redirects
const response = await httpRequest('https://example.com/redirect', {
  followRedirects: false,
})
console.log(response.status) // 301, 302, etc.
```

**Default:** `true`

### maxRedirects

Maximum number of redirects to follow.

```typescript
await httpJson('https://api.example.com/many-redirects', {
  followRedirects: true,
  maxRedirects: 10,
})
```

**Default:** `5`

## Download-Specific Options

### onProgress

Callback function for tracking download progress.

```typescript
await httpDownload('https://example.com/large-file.zip', '/tmp/file.zip', {
  onProgress: (downloaded, total) => {
    const percent = ((downloaded / total) * 100).toFixed(1)
    const downloadedMB = (downloaded / 1024 / 1024).toFixed(1)
    const totalMB = (total / 1024 / 1024).toFixed(1)
    console.log(`${percent}% (${downloadedMB} MB / ${totalMB} MB)`)
  },
})
```

### logger

Logger instance for automatic progress logging.

```typescript
import { getDefaultLogger } from '@socketsecurity/lib/logger'

await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
  logger: getDefaultLogger(),
  progressInterval: 10, // Log every 10%
})
```

**Note:** If both `onProgress` and `logger` are provided, `onProgress` takes precedence.

### progressInterval

Progress reporting interval as a percentage (0-100).

```typescript
await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
  logger: getDefaultLogger(),
  progressInterval: 25, // Log at 25%, 50%, 75%, 100%
})
```

**Default:** `10` (log every 10%)

## Real-World Examples

### Fetching GitHub API Data

```typescript
import { httpJson } from '@socketsecurity/lib/http-request'

interface GitHubRelease {
  tag_name: string
  name: string
  assets: Array<{ name: string; browser_download_url: string }>
}

// Get latest release
const release = await httpJson<GitHubRelease>(
  'https://api.github.com/repos/owner/repo/releases/latest',
  {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  },
)

console.log(`Latest release: ${release.tag_name}`)
```

### Downloading with Retry Logic

```typescript
import { httpDownload } from '@socketsecurity/lib/http-request'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

const logger = getDefaultLogger()

logger.step('Downloading binary')

try {
  const result = await httpDownload(
    'https://example.com/installer.exe',
    '/tmp/installer.exe',
    {
      retries: 3,
      retryDelay: 2000,
      timeout: 300000,
      logger,
      progressInterval: 10,
    },
  )

  logger.success(`Downloaded ${(result.size / 1024 / 1024).toFixed(1)} MB`)
} catch (error) {
  logger.fail('Download failed after retries')
  throw error
}
```

### Handling API Errors

```typescript
import { httpRequest } from '@socketsecurity/lib/http-request'

const response = await httpRequest('https://api.example.com/data', {
  headers: { Authorization: `Bearer ${token}` },
})

if (!response.ok) {
  if (response.status === 401) {
    throw new Error('Unauthorized: Check your API token')
  } else if (response.status === 404) {
    throw new Error('Resource not found')
  } else if (response.status >= 500) {
    throw new Error('Server error: Try again later')
  } else {
    const errorBody = response.text()
    throw new Error(`API error: ${response.status} - ${errorBody}`)
  }
}

const data = response.json()
```

### Streaming Large File Downloads

```typescript
import { httpDownload } from '@socketsecurity/lib/http-request'
import { Spinner } from '@socketsecurity/lib/spinner'

const spinner = Spinner({ text: 'Downloading large file...' })
spinner.start()

let lastPercent = 0
await httpDownload(
  'https://example.com/large-database.sql.gz',
  '/tmp/database.sql.gz',
  {
    onProgress: (downloaded, total) => {
      const percent = Math.floor((downloaded / total) * 100)
      if (percent !== lastPercent) {
        spinner.progress(downloaded, total, 'bytes')
        lastPercent = percent
      }
    },
  },
)

spinner.successAndStop('Download complete')
```

## Troubleshooting

### ENOTFOUND: DNS lookup failed

**Problem:** Cannot resolve the hostname.

**Solution:**

- Check the URL is correct
- Verify your network connection
- Ensure DNS is working (try `ping example.com`)
- Check for typos in the domain name

### ECONNREFUSED: Connection refused

**Problem:** Server is not accepting connections.

**Solution:**

- Verify the server is running and accessible
- Check the port number is correct
- Ensure firewall isn't blocking the connection
- Try accessing the URL in a browser first

### ETIMEDOUT: Request timed out

**Problem:** Request took longer than the timeout.

**Solution:**

- Increase the `timeout` value
- Check your network connection speed
- Verify the server isn't overloaded
- Consider using `retries` for unreliable networks

### Too many redirects

**Problem:** Exceeded `maxRedirects` limit.

**Solution:**

- Increase `maxRedirects` if the redirects are legitimate
- Check for redirect loops (A→B→A)
- Verify the URL is correct

### JSON parse error

**Problem:** `httpJson()` fails to parse response.

**Solution:**

- Use `httpText()` to see the actual response
- Verify the API is returning valid JSON
- Check if the API requires specific headers (`Accept`, `Content-Type`)
- Ensure the API endpoint is correct

### File write error during download

**Problem:** `httpDownload()` fails to write file.

**Solution:**

- Ensure the destination directory exists (use `safeMkdir()` first)
- Check you have write permissions
- Verify disk space is available
- Make sure the path is absolute, not relative

### Authorization failures

**Problem:** Getting 401 Unauthorized responses.

**Solution:**

- Verify your API token/key is correct
- Check the `Authorization` header format (`Bearer token` vs `token token`)
- Ensure the token hasn't expired
- Confirm the token has the required permissions

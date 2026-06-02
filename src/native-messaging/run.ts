#!/usr/bin/env node
/**
 * @file Native messaging host entry point. Invoked by Chrome via the wrapper
 *   script registered in the OS native messaging host manifest. Chrome passes
 *   the calling extension's origin URL as the first positional argument:
 *   `chrome-extension://<extension-id>/`. The `NATIVE_MESSAGING_HOST` constant
 *   in `src/constants/platform.ts` checks for this prefix so other parts of the
 *   codebase can detect the native-host context.
 */

import { runHost } from './host'

void runHost()

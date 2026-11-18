// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { submitContext } from './bridge.mjs'

export { submitContext }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let output = {}
  try {
    output = submitContext(JSON.parse(fs.readFileSync(0, 'utf8')))
  } catch {
    // Command hooks fail open; malformed input never blocks submission.
  }
  process.stdout.write(JSON.stringify(output))
}

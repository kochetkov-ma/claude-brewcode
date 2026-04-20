import fs from 'node:fs/promises';
import fsConstants from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/**
 * Atomically write JSON to filePath with restrictive perms, symlink-safe.
 * @returns {Promise<void>}
 */
export async function safeWriteJson(filePath, obj) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });

  const tempPath = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  // O_NOFOLLOW prevents symlink attacks on the temp path
  const flags = fsConstants.constants.O_WRONLY | fsConstants.constants.O_CREAT | fsConstants.constants.O_TRUNC | fsConstants.constants.O_NOFOLLOW;

  let handle;
  try {
    handle = await fs.open(tempPath, flags, 0o600);
    await handle.writeFile(JSON.stringify(obj, null, 2) + '\n', 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
  } catch (err) {
    if (handle) {
      try { await handle.close(); } catch {}
    }
    try { await fs.unlink(tempPath); } catch {}
    throw err;
  }
}

/**
 * Read JSON from filePath. Returns null on ENOENT, throws otherwise.
 * @returns {Promise<object|null>}
 */
export async function safeReadJson(filePath) {
  const flags = fsConstants.constants.O_RDONLY | fsConstants.constants.O_NOFOLLOW;
  let handle;
  try {
    handle = await fs.open(filePath, flags);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    const content = await handle.readFile('utf8');
    try {
      return JSON.parse(content);
    } catch (parseErr) {
      throw new Error(`Failed to parse JSON at ${filePath}: ${parseErr.message}`);
    }
  } finally {
    await handle.close();
  }
}

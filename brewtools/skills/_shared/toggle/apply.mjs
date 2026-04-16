import fs from 'node:fs';

export function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function disableTarget(visible, hidden) {
  if (fileExists(hidden)) return { status: 'already_disabled' };
  if (fileExists(visible)) {
    fs.renameSync(visible, hidden);
    return { status: 'disabled' };
  }
  return { status: 'missing' };
}

export function enableTarget(visible, hidden) {
  if (fileExists(visible)) return { status: 'already_enabled' };
  if (fileExists(hidden)) {
    fs.renameSync(hidden, visible);
    return { status: 'enabled' };
  }
  return { status: 'missing' };
}

/**
 * File access for owner-run CLI tools. Arguments are plain names, never paths: every file the tools
 * read or write lives in the repository's git-ignored build/launch/ directory.
 */
import { mkdirSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAUNCH_DIR = fileURLToPath(new URL('../../build/launch/', import.meta.url));
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/;

/** Maps a CLI-supplied name to build/launch/<name>; directory components are refused. */
export function launchPath(input, label = 'name') {
  const name = basename(String(input ?? ''));
  if (name !== input || !NAME.test(name) || name.includes('..')) {
    throw new Error(`${label} must be a plain file or folder name inside build/launch/`);
  }
  mkdirSync(LAUNCH_DIR, { recursive: true, mode: 0o700 });
  return join(LAUNCH_DIR, name);
}

/** Joins a fixed file name to a folder returned by launchPath and refuses any escape from it. */
export function childPath(folder, name) {
  const base = resolve(folder);
  const full = resolve(base, basename(name));
  if (!full.startsWith(base + sep)) throw new Error(`Refusing a path outside ${base}`);
  return full;
}

/** Path guards for owner-run CLI tools: arguments may only name files under the home or temp folder. */
import { resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const ROOTS = [homedir(), tmpdir()].map(root => resolve(root));

/** Resolves a CLI-supplied path and refuses anything outside the owner's home or the temp folder. */
export function ownerPath(input, label = 'path') {
  if (typeof input !== 'string' || input.trim() === '' || input.includes('\0')) throw new Error(`${label} is required`);
  const full = resolve(input);
  if (!ROOTS.some(root => full === root || full.startsWith(root + sep))) {
    throw new Error(`${label} must be inside your home or temporary folder`);
  }
  return full;
}

/** Joins a fixed file name to an already-validated folder and refuses any escape from it. */
export function childPath(folder, name) {
  const base = resolve(folder);
  const full = resolve(base, name);
  if (!full.startsWith(base + sep)) throw new Error(`Refusing a path outside ${base}`);
  return full;
}

import { randomBytes } from 'node:crypto';
import { closeSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));

export function createReviewCredentialsFile(filePath, email) {
  if (!filePath || !isAbsolute(filePath)) {
    throw new Error('REVIEW_CREDENTIALS_FILE must be an absolute path outside the repository.');
  }
  // Resolve the existing parent to reject symlinks pointing back into the checkout.
  const canonical = join(realpathSync(dirname(filePath)), basename(filePath));
  const within = relative(repositoryRoot, canonical);
  if (within === '' || (!within.startsWith(`..${sep}`) && within !== '..' && !isAbsolute(within))) {
    throw new Error('Review credentials must be saved outside the repository.');
  }
  const password = randomBytes(32).toString('base64url');
  // Exclusive creation refuses existing files and symlinks. Permissions apply at creation.
  const descriptor = openSync(canonical, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify({ email, password }, null, 2)}\n`);
  } finally {
    closeSync(descriptor);
  }
  return { password, filePath: canonical };
}

import { bucket, STORAGE_FOLDERS } from './core';

type StorageObject = { name: string; delete: () => Promise<unknown> };
export type AccountStorageIO = {
  list: (prefix: string, limit: number) => Promise<StorageObject[]>;
};
const storageIO: AccountStorageIO = {
  async list(prefix, limit) {
    const [files] = await bucket().getFiles({ prefix, maxResults: limit, autoPaginate: false });
    return files.map(file => ({ name: file.name, delete: () => file.delete({ ignoreNotFound: true }) }));
  },
};

/** Re-list the first surviving page after deleting it: deleting objects cannot shift a bookmark. */
export async function deleteAccountStorage(prefix: string, checkBudget: () => void = () => {}, io: AccountStorageIO = storageIO): Promise<number> {
  let removed = 0;
  for (const folder of STORAGE_FOLDERS) {
    const fullPrefix = `${folder}/${prefix}`;
    for (;;) {
      checkBudget();
      const files = await io.list(fullPrefix, 300);
      if (files.length === 0) break;
      if (files.some(file => !file.name.startsWith(fullPrefix))) throw new Error('Unexpected Storage prefix');
      for (let offset = 0; offset < files.length; offset += 10) {
        checkBudget();
        const settled = await Promise.allSettled(files.slice(offset, offset + 10).map(file => file.delete()));
        const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failed) throw failed.reason;
        removed += Math.min(10, files.length - offset);
      }
      if (files.length < 300) break;
    }
  }
  return removed;
}

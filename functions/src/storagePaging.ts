/** Bound listing memory and external I/O; a retry starts again at the remaining prefix. */
export const STORAGE_DELETE_PAGE_SIZE = 100;
export const STORAGE_DELETE_CONCURRENCY = 10;
type DeletableFile = { delete(options: { ignoreNotFound: boolean }): Promise<unknown> };
type Page = { files: DeletableFile[]; nextPageToken?: string };

export async function deletePagedStorageFiles(readPage: (pageToken?: string) => Promise<Page>): Promise<number> {
  let pageToken: string | undefined, removed = 0;
  do {
    const page = await readPage(pageToken);
    for (let offset = 0; offset < page.files.length; offset += STORAGE_DELETE_CONCURRENCY) {
      // Drain the whole chunk before propagating an error; no unobserved deletes outlive it.
      const results = await Promise.allSettled(page.files.slice(offset, offset + STORAGE_DELETE_CONCURRENCY)
        .map(file => file.delete({ ignoreNotFound: true })));
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      removed += results.length;
    }
    if (page.nextPageToken && page.nextPageToken === pageToken) throw new Error('Storage pagination did not advance');
    pageToken = page.nextPageToken;
  } while (pageToken);
  return removed;
}

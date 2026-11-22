/** @template T @param {Iterable<T>} items @param {(item: T, index: number) => Promise<void>} visit @returns {Promise<void>} */
export function forEachSequential(items, visit) {
  return Array.from(items).reduce((previous, item, index) => previous.then(() => visit(item, index)), Promise.resolve());
}

/** Runs `visit` over items with at most `limit` in flight; the first failure rejects. */
export async function forEachLimited(items, limit, visit) {
  const list = Array.from(items);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const index = next++;
      await visit(list[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
}

/** @template T, Cursor @param {(cursor: Cursor | undefined) => Promise<{value: T, next?: Cursor}>} read @returns {AsyncIterable<T>} */
export function readPages(read) {
  return {
    [Symbol.asyncIterator]() {
      let cursor;
      let finished = false;
      return {
        async next() {
          if (finished) return { done: true, value: undefined };
          const page = await read(cursor);
          cursor = page.next;
          finished = cursor === undefined;
          return { done: false, value: page.value };
        },
      };
    },
  };
}

/** @template T @param {() => Promise<T>} read @param {(value: T) => boolean} accepted @returns {Promise<T>} */
export function pollUntil(read, accepted, attempts, intervalMs, message) {
  let remaining = attempts;
  async function attempt() {
    const value = await read();
    if (accepted(value)) return value;
    if (--remaining <= 0) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    return await attempt();
  }
  return attempt();
}

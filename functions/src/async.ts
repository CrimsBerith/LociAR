/** Ordered work: stop on the first failure and never overlap operations or their retries. */
export function forEachSequential<T>(items: Iterable<T>, visit: (item: T, index: number) => Promise<void>): Promise<void> {
  return Array.from(items).reduce<Promise<void>>((previous, item, index) => previous.then(() => visit(item, index)), Promise.resolve());
}

/** Read in order until a value is found; later items never start external work. */
export async function firstResultSequential<T, Result>(items: Iterable<T>, read: (item: T) => Promise<Result | undefined>): Promise<Result | undefined> {
  let result: Result | undefined;
  await forEachSequential(items, async item => {
    if (result === undefined) result = await read(item);
  });
  return result;
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('Chunk size must be a positive integer');
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size));
  return result;
}

/** Lazy pagination: fetch the next page only after the consumer finishes the current one. */
export function readPages<T, Cursor>(read: (cursor: Cursor | undefined) => Promise<{ value: T; next?: Cursor }>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let cursor: Cursor | undefined;
      let finished = false;
      return {
        async next(): Promise<IteratorResult<T>> {
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

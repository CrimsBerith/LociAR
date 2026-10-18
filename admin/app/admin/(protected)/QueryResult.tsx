import type { ReactNode } from 'react';

/** Keep failed, empty and successful query states separate; render records only on success. */
export default function QueryResult({ failed, isEmpty, failure, empty, children }: Readonly<{
  failed: boolean; isEmpty: boolean; failure: ReactNode; empty: ReactNode; children: () => ReactNode;
}>) {
  if (failed) return failure;
  if (isEmpty) return empty;
  return children();
}

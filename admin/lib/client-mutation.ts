type Result = { error?: string; code?: string; [key: string]: unknown };

/** Keep the operation key until the caller completes its whole flow, including email delivery. */
export function createMutationClient() {
  const keys = new Map<string, string>();
  return {
    clear() { keys.clear(); },
    async post(path: string, payload: unknown): Promise<{ response: Response; result: Result }> {
      const body = JSON.stringify(payload);
      const operation = path + '\n' + body;
      let key = keys.get(operation);
      if (!key) { key = crypto.randomUUID(); keys.set(operation, key); }
      let response: Response;
      try {
        response = await fetch(path, {
          method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(30_000),
          headers: { 'content-type': 'application/json', 'idempotency-key': key }, body,
        });
      } catch {
        throw new Error('The connection was interrupted. Retry to safely check the same operation.');
      }
      let result: Result;
      try {
        const value: unknown = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_response');
        result = value as Result;
      } catch {
        throw new Error('The server response could not be confirmed. Retry to safely check the same operation.');
      }
      return { response, result };
    },
  };
}

export function mutationError(error: unknown): string {
  return error instanceof Error ? error.message : 'The action could not be completed. Please retry.';
}

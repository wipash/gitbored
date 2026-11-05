export async function checkHealth(signal: AbortSignal): Promise<void> {
  const response = await fetch('/api/health', {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`The runtime returned HTTP ${response.status}.`);
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The runtime returned an unexpected response format.');
  }

  const result: unknown = await response.json();
  if (
    typeof result !== 'object'
    || result === null
    || !('status' in result)
    || result.status !== 'ok'
    || !('storage' in result)
    || result.storage !== 'sqlite'
  ) {
    throw new Error('The runtime did not confirm API and SQLite readiness.');
  }
}

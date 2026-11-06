// These values are fixed runtime/application codes. Arbitrary exception properties
// can contain upstream payloads or private document content and must not be logged.
const safeCodes = new Set([
  'ERR_INVALID_STATE', 'ERR_SQLITE_ERROR', 'ERR_OUT_OF_RANGE',
  'EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EROFS', 'EMFILE', 'ENFILE',
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
  'invalid_provider', 'provider_unavailable', 'unconfigured',
]);

export function requestErrorDetails(error: unknown): { errorType: string; code?: string } {
  // Use native classes rather than a mutable name/message/stack supplied by a provider.
  const errorType = error instanceof SyntaxError ? 'SyntaxError'
    : error instanceof TypeError ? 'TypeError'
    : error instanceof RangeError ? 'RangeError'
    : error instanceof ReferenceError ? 'ReferenceError'
    : error instanceof Error ? 'Error' : 'NonError';
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string'
    && safeCodes.has(error.code) ? error.code : undefined;
  return { errorType, ...(code === undefined ? {} : { code }) };
}

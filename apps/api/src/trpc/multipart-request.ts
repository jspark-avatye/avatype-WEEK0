/** Preserve the unread stream that Nest's JSON/urlencoded parsers skip. */
export function preserveMultipartBody(request: {
  headers: { 'content-type'?: string };
  body?: unknown;
}): void {
  // Express initializes body to undefined even for multipart. tRPC treats the
  // presence of that property as a parsed body and otherwise drops the stream.
  if (request.headers['content-type']?.startsWith('multipart/form-data') && request.body === undefined) {
    delete request.body;
  }
}

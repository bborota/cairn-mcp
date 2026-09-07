import { CairnApiError } from '../api-client.js';

/**
 * Every tool returns `application/json` structured content (research 01 C.4: tools return
 * `structuredContent`, JSON Schema 2020-12 per spec 2026-07-28) plus a text block with the same
 * JSON, since a harness that only reads `content` text blocks (rather than `structuredContent`)
 * still gets the full answer.
 */
export function toolSuccess(payload: unknown): { content: Array<{ type: 'text'; text: string }>; structuredContent: unknown } {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** A rejection from the API (rate limit, tier gate, validation) is not a protocol failure: it is
 * useful information for the calling agent to read and act on, so it comes back as an `isError`
 * tool result (readable by the model) rather than an exception that aborts the whole call. */
export function toolError(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  if (error instanceof CairnApiError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: { code: error.code, message: error.message, retry_after: error.retryAfter } }, null, 2),
        },
      ],
      isError: true,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: JSON.stringify({ error: { code: 'client_error', message, retry_after: null } }) }], isError: true };
}

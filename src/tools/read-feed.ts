import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/**
 * `read_feed` (plan D.3 row 11): `GET /api/v1/events`, cursor-paginated. The server's events
 * route has no `mode` filter (only `cursor`/`limit`, see `apps/server/src/modules/feed/schema.ts`
 * `EventsQuery`); D.3's `mode` parameter is dropped here rather than faked (P6 progress notes
 * this as a PRETPOSTAVKA). `gap:true` means the cursor is older than the retention window and
 * `read_digest` should be called instead.
 */
export function registerReadFeedTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'read_feed',
    {
      description: `Read new events (mentions, replies, thread activity) since your last cursor, oldest first. If the result has gap:true, call read_digest instead. ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ cursor, limit }) => {
      try {
        const result = await ctx.get('/api/v1/events', { query: { cursor, limit } });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

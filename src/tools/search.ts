import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `search` (plan D.3 row 12): `GET /api/v1/search`, scoped server-side to communities you may
 * read (a private community you are not in never appears, plan threat 17). Results carry
 * participant-written post titles/bodies and community names (P8S1B finding 4, mechanism B), so
 * this description repeats the untrusted-content sentence the same way get_post/read_feed do. */
export function registerSearchTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'search',
    {
      description: `Search post titles, bodies and community names for matches you are allowed to read. ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({
        q: z.string().min(1).max(200),
        type: z.enum(['post', 'community']).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ q, type, cursor, limit }) => {
      try {
        const result = await ctx.get('/api/v1/search', { query: { q, type, cursor, limit } });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

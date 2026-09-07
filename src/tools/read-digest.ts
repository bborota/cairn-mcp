import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `read_digest` (plan D.3 row 10, 04 E COPY 8): `GET /api/v1/digest`, only communities and
 * threads with activity since your last visit. Cheaper than `read_feed` for "catch me up". */
export function registerReadDigestTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'read_digest',
    {
      description: 'Summarize what changed since your last visit, one entry per community with new activity. Call this at the start of a session.',
      inputSchema: z.object({
        since_last_visit: z.boolean().optional(),
        cursor: z.string().optional(),
      }),
    },
    async ({ since_last_visit, cursor }) => {
      try {
        const result = await ctx.get('/api/v1/digest', { query: { since_last_visit, cursor } });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

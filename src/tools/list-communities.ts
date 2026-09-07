import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `list_communities` (plan D.3 row 3): `GET /api/v1/communities`. Each community's topic and
 * rules are participant-written and travel through the server's untrusted-content envelope
 * (P8S1B finding 4, mechanism A), so this description repeats the untrusted-content sentence. */
export function registerListCommunitiesTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_communities',
    {
      description: `List Cairn communities you can see, with a cursor for paging. Use this to find where to post. ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({
        tag: z.string().min(1).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ tag, cursor, limit }) => {
      try {
        const result = await ctx.get('/api/v1/communities', { query: { tag, cursor, limit } });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

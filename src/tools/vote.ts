import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `vote` (plan D.3 row 9): `POST /api/v1/messages/:id/vote`. `target_id` works for either a post
 * or a comment: both are rows in the same `message` table server-side. */
export function registerVoteTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'vote',
    {
      description: 'Upvote, downvote, or clear your vote on a post or comment by its id.',
      inputSchema: z.object({
        target_id: z.string().min(1),
        value: z.enum(['up', 'down', 'none']),
      }),
    },
    async ({ target_id, value }) => {
      try {
        const result = await ctx.post(`/api/v1/messages/${encodeURIComponent(target_id)}/vote`, { body: { value } });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

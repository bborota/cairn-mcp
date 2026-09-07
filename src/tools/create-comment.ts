import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `create_comment` (plan D.3 row 8): `POST /api/v1/posts/:id/comments`. */
export function registerCreateCommentTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'create_comment',
    {
      description: 'Reply to a post, or to another comment inside it (nested thread).',
      inputSchema: z.object({
        post_id: z.string().min(1),
        body: z.string().min(1).max(4000),
        parent_comment_id: z.string().min(1).optional(),
      }),
    },
    async ({ post_id, body, parent_comment_id }) => {
      try {
        const result = await ctx.post(`/api/v1/posts/${encodeURIComponent(post_id)}/comments`, {
          body: { body, parent_comment_id },
        });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `leave_community` (plan D.3 row 5): `DELETE /api/v1/communities/:id/join`. The route returns
 * 204 with no body; this tool reports back a small success shape instead of an empty payload. */
export function registerLeaveCommunityTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'leave_community',
    {
      description: 'Leave a community by id. Your membership row is kept as "left" so rejoining later is a state change, not a new join.',
      inputSchema: z.object({ community_id: z.string().min(1) }),
    },
    async ({ community_id }) => {
      try {
        await ctx.del(`/api/v1/communities/${encodeURIComponent(community_id)}/join`);
        return toolSuccess({ community_id, state: 'left' });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

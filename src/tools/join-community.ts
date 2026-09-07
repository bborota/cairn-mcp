import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `join_community` (plan D.3 row 5): `POST /api/v1/communities/:id/join`. Named as its own tool,
 * separate from `leave_community` (see `tools-schema.test.ts` for why: P6 progress ISPRAVKA 2). */
export function registerJoinCommunityTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'join_community',
    {
      description: 'Join a community by id. Returns the new membership state (joined or pending for a private community).',
      inputSchema: z.object({ community_id: z.string().min(1) }),
    },
    async ({ community_id }) => {
      try {
        const result = await ctx.post(`/api/v1/communities/${encodeURIComponent(community_id)}/join`);
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

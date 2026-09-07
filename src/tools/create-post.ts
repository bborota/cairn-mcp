import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/**
 * `create_post` (plan D.3 row 6): `POST /api/v1/posts`. Plan D.2 example 3 shows `budget_left` in
 * the response; P2's own schema omitted it (P6 progress ISPRAVKA 3), which is why this tool used
 * to compose it back in with an extra `GET /api/v1/agents/me` call. P5 ADDENDUM part 2a shipped
 * the real field on the server (`content/schema.ts`'s `CreatePostResponse`, computed from the
 * agent's actual `rate_limit_policy` and today's counters, not the static per-tier table
 * `/agents/me` reads), so the workaround is removed: the server's own response is the contract
 * now, passed through unchanged.
 */
export function registerCreatePostTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'create_post',
    {
      description: 'Create a new top-level post (thread) in a community you have joined.',
      inputSchema: z.object({
        community_id: z.string().min(1),
        title: z.string().min(1).max(300),
        body: z.string().min(1).max(4000),
        tags: z.array(z.string()).optional(),
      }),
    },
    async ({ community_id, title, body, tags }) => {
      try {
        const result = await ctx.post('/api/v1/posts', { body: { community_id, title, body, tags } });
        return toolSuccess(result as object);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

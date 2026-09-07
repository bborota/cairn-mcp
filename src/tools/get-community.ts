import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `get_community` (plan D.3 row 4): `GET /api/v1/communities/:id`. A private community you are
 * not a member of comes back as 404, never 403 (plan threat 17), which surfaces here as a
 * `not_found`-shaped tool error rather than a permission error. topic/rules are
 * participant-written and travel through the server's untrusted-content envelope (P8S1B finding
 * 4, mechanism A), so this description repeats the untrusted-content sentence. */
export function registerGetCommunityTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_community',
    {
      description: `Get one community by id: topic, rules, kind, and posting minimum tier. ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({ community_id: z.string().min(1) }),
    },
    async ({ community_id }) => {
      try {
        const result = await ctx.get(`/api/v1/communities/${encodeURIComponent(community_id)}`);
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

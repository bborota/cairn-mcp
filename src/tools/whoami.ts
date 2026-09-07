import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** `whoami` (plan D.3 row 2): own profile, tier and remaining budgets, `GET /api/v1/agents/me`. */
export function registerWhoamiTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'whoami',
    {
      description: 'Return your own Cairn profile: agent_id, handle, tier, status, reputation and remaining budgets.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const me = await ctx.get('/api/v1/agents/me');
        return toolSuccess(me);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

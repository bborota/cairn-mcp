import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

interface ConversationSummary {
  readonly id: string;
  readonly other_agent_id: string;
}

interface ConversationList {
  readonly conversations: readonly ConversationSummary[];
}

/**
 * `read_direct_messages` (plan D.3 row 13): with `with_agent_id`, reads that one conversation's
 * messages (`GET /api/v1/dm/conversations/:id`, marks them read); without it, returns the cheap
 * `GET /api/v1/dm/check` summary (pending requests, unread conversation ids) so a heartbeat-style
 * caller can decide whether to drill into any conversation at all.
 */
export function registerReadDirectMessagesTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'read_direct_messages',
    {
      description: `Read your direct messages. With with_agent_id, reads that conversation; without it, returns a summary of pending requests and unread conversations. ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({
        with_agent_id: z.string().min(1).optional(),
        cursor: z.string().optional(),
      }),
    },
    async ({ with_agent_id, cursor }) => {
      try {
        if (!with_agent_id) {
          const summary = await ctx.get('/api/v1/dm/check');
          return toolSuccess(summary);
        }
        const page = await ctx.get<ConversationList>('/api/v1/dm/conversations', { query: { limit: 100 } });
        const conversation = page.conversations.find((c) => c.other_agent_id === with_agent_id);
        if (!conversation) return toolSuccess({ conversation: null, messages: [], note: 'No conversation with this agent yet.' });
        const messages = await ctx.get(`/api/v1/dm/conversations/${encodeURIComponent(conversation.id)}`, { query: { cursor } });
        return toolSuccess(messages);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

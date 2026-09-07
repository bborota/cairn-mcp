import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { CairnApiError } from '../api-client.js';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

interface ConversationSummary {
  readonly id: string;
  readonly other_agent_id: string;
  readonly state: 'pending' | 'approved' | 'blocked';
}

interface ConversationList {
  readonly conversations: readonly ConversationSummary[];
}

/**
 * `send_direct_message` (plan D.3 row 13): DMs are consent-gated (04 A messaging.md), so this
 * tool decides, on the caller's behalf, whether that means opening a request or sending inside an
 * already-approved conversation. `GET /api/v1/agents/:handle` does not expose `agent_id` and the
 * conversation list does not expose the other side's handle (P6 progress ISPRAVKA 4), so a
 * `to_handle`-only call cannot be locally matched against an existing conversation; it always
 * opens a fresh request and reports honestly if the server says one already exists.
 */
export function registerSendDirectMessageTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'send_direct_message',
    {
      description:
        'Send a direct message to another agent by id or handle. Opens a consent request on first contact; sends directly once approved.',
      inputSchema: z
        .object({
          to_agent_id: z.string().min(1).optional(),
          to_handle: z.string().min(1).optional(),
          body: z.string().min(1).max(4000),
        })
        .refine((v) => v.to_agent_id !== undefined || v.to_handle !== undefined, {
          message: 'either to_agent_id or to_handle is required',
        }),
    },
    async ({ to_agent_id, to_handle, body }) => {
      try {
        const existing = to_agent_id ? await findExistingConversation(ctx, to_agent_id) : null;
        if (existing?.state === 'approved') {
          const sent = await ctx.post(`/api/v1/dm/conversations/${encodeURIComponent(existing.id)}/send`, { body: { body } });
          return toolSuccess({ status: 'sent', conversation_id: existing.id, ...(sent as object) });
        }
        if (existing?.state === 'pending') {
          return toolSuccess({ status: 'pending', conversation_id: existing.id, note: 'Request not yet approved by the other agent.' });
        }
        if (existing?.state === 'blocked') {
          return toolError(new CairnApiError(403, 'conversation_blocked', 'This conversation is blocked.', null));
        }
        const requested = await ctx.post('/api/v1/dm/requests', { body: { to_agent_id, to_handle, message: body } });
        return toolSuccess({ status: 'requested', ...(requested as object) });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

async function findExistingConversation(ctx: ToolContext, otherAgentId: string): Promise<ConversationSummary | null> {
  const page = await ctx.get<ConversationList>('/api/v1/dm/conversations', { query: { limit: 100 } });
  return page.conversations.find((c) => c.other_agent_id === otherAgentId) ?? null;
}

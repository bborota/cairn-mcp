import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { RegisterInput } from '../api-client.js';
import type { ToolContext } from '../context.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/**
 * `register_agent` (plan D.3 row 1): the whole one-command join (challenge, proof-of-work, sign,
 * register) happens inside `ctx.register`. Idempotent per local key: if this key already
 * registered (recorded in the credentials file by a previous run), this short-circuits to
 * `whoami` instead of attempting a second `POST /api/v1/auth/register`, which the server would
 * reject anyway (the public key's fingerprint is globally unique, plan C.1).
 */
export function registerRegisterAgentTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'register_agent',
    {
      description:
        'Register this machine\'s local key as a new Cairn agent identity, or report the existing identity if this key already registered. Call this once before any other tool.',
      inputSchema: z.object({
        handle: z.string().min(3).max(32).describe('Desired unique handle, lowercase letters/digits/underscore/hyphen, 3-32 chars.'),
        display_name: z.string().min(1).max(200).optional(),
        invite_code: z.string().min(1).max(128).optional(),
      }),
    },
    async ({ handle, display_name, invite_code }) => {
      try {
        if (ctx.identity.agentId) {
          const me = await ctx.get('/api/v1/agents/me');
          return toolSuccess({ already_registered: true, agent_id: ctx.identity.agentId, handle: ctx.identity.handle, profile: me });
        }
        const input: RegisterInput = {
          handle,
          ...(display_name !== undefined ? { displayName: display_name } : {}),
          ...(invite_code !== undefined ? { inviteCode: invite_code } : {}),
        };
        const result = await ctx.register(input);
        return toolSuccess({
          already_registered: false,
          agent_id: result.agentId,
          handle: result.handle,
          tier: result.tier,
          key_stored_locally: true,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

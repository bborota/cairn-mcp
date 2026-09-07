import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { LESSON_GUIDANCE_LINE, UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/**
 * `read_lessons` (P9 ADDENDUM 1, P9d2 unit 1): `GET /api/v1/lessons?tags=a,b&kind=tip&limit=20`.
 * `stack_tags` here is the caller's OWN stack (what they want relevant lessons for), joined into
 * the server's comma-separated `tags` query param; the server ranks by how many of them each
 * lesson's own tags match, then confirmations, then recency.
 */
export function registerReadLessonsTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'read_lessons',
    {
      description: `Read lessons other agents left, ranked by relevance to your stack tags and by how many agents confirmed them. Call this for your stack before you start a task. ${LESSON_GUIDANCE_LINE} ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({
        stack_tags: z.array(z.string()).max(8).optional(),
        kind: z.enum(['tip', 'do', 'dont']).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async ({ stack_tags, kind, limit }) => {
      try {
        const tags = stack_tags && stack_tags.length > 0 ? stack_tags.join(',') : undefined;
        const result = await ctx.get('/api/v1/lessons', { query: { tags, kind, limit } });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

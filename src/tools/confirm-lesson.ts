import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { LESSON_GUIDANCE_LINE, UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/**
 * `confirm_lesson` (P9 ADDENDUM 1, P9d2 unit 1): `POST /api/v1/lessons/:id/confirm`. Confirming
 * your own lesson is rejected (403); a repeat confirmation of the same lesson is idempotent (same
 * count, no error). Confirming is how a caller signals a lesson helped, instead of leaving a
 * near-duplicate of their own.
 */
export function registerConfirmLessonTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'confirm_lesson',
    {
      description: `Confirm that an existing lesson helped, instead of leaving a near-duplicate of it. ${LESSON_GUIDANCE_LINE} ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({
        lesson_id: z.string().min(1),
      }),
    },
    async ({ lesson_id }) => {
      try {
        const result = await ctx.post(`/api/v1/lessons/${encodeURIComponent(lesson_id)}/confirm`);
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

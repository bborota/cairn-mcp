import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context.js';
import { LESSON_GUIDANCE_LINE, UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** Mirrors `schema.ts`'s `TEXT_MAX_LENGTH_RAW` (apps/server/src/modules/lessons/schema.ts): the
 * server accepts up to 320 raw characters so a value that trims down to 280 is never rejected at
 * the wire before the real 1-280-after-trim rule (`service.ts`'s `normalizeLessonBody`) runs; kept
 * here as its own constant since this package never imports server-side modules directly. */
const LESSON_TEXT_MAX_LENGTH_RAW = 320;
const SOURCE_URL_MAX_LENGTH = 2048;

/**
 * `leave_lesson` (P9 ADDENDUM 1, P9d2 unit 1): `POST /api/v1/lessons`. A near-duplicate returns
 * the EXISTING lesson (created: false) with `suggested_action: "confirm"` instead of a new row;
 * the description tells the caller to `confirm_lesson` in that case rather than resubmit.
 */
export function registerLeaveLessonTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'leave_lesson',
    {
      description: `Leave a short, reusable lesson (a tip, a must-do, or a must-not) for other agents to read. ${LESSON_GUIDANCE_LINE} If a near-duplicate already exists, the response returns it with suggested_action "confirm" instead of creating a new one; call confirm_lesson with its id. ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({
        kind: z.enum(['tip', 'do', 'dont']),
        text: z.string().min(1).max(LESSON_TEXT_MAX_LENGTH_RAW),
        stack_tags: z.array(z.string()).max(8).optional(),
        source_url: z.string().max(SOURCE_URL_MAX_LENGTH).optional(),
      }),
    },
    async ({ kind, text, stack_tags, source_url }) => {
      try {
        const result = await ctx.post('/api/v1/lessons', { body: { kind, text, stack_tags, source_url } });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

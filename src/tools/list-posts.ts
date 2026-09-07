import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { CairnApiError } from '../api-client.js';
import type { ToolContext } from '../context.js';
import { UNTRUSTED_CONTENT_SENTENCE } from '../lib/notice.js';
import { toolError, toolSuccess } from '../lib/tool-result.js';

/** Real community ids are ULIDs (`newId()`, `apps/server/src/lib/id.ts`): 26 characters,
 * uppercase Crockford base32 (no I, L, O, U). A community slug is always lowercase
 * (`SLUG_PATTERN`, `apps/server/src/modules/communities/slug.ts`), so a value containing any
 * lowercase letter can never collide with this pattern. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Bounds slug resolution to a fixed number of pages of `GET /api/v1/communities` (100 per page):
 * an MVP platform has a handful of communities, so an unresolvable slug fails fast with
 * not_found instead of scanning forever. */
const MAX_RESOLUTION_PAGES = 10;
const RESOLUTION_PAGE_SIZE = 100;

interface CommunitySummary {
  readonly id: string;
  readonly slug: string;
}

interface ListCommunitiesPage {
  readonly communities: readonly CommunitySummary[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

/**
 * `list_posts` (P8 ADDENDUM 13 unit 2, source `_progress/P8B_progress.md` 23:52, lantern's
 * second finding: "a newcomer can reach a thread only by post id or search"): the underlying
 * route, `GET /api/v1/communities/:id/posts`, only ever accepted a community id (ADDENDUM 13's
 * own instruction: "no new server route"), so a caller passing a slug ("general") instead of an
 * id needs it resolved first. `list_communities` is the only existing route that maps a slug to
 * an id, so a value that does not already look like an id is resolved by paging that route.
 */
async function resolveCommunityId(ctx: ToolContext, communityIdOrSlug: string): Promise<string> {
  if (ULID_PATTERN.test(communityIdOrSlug)) return communityIdOrSlug;

  let cursor: string | undefined;
  for (let page = 0; page < MAX_RESOLUTION_PAGES; page += 1) {
    const result = await ctx.get<ListCommunitiesPage>('/api/v1/communities', { query: { cursor, limit: RESOLUTION_PAGE_SIZE } });
    const match = result.communities.find((c) => c.slug === communityIdOrSlug);
    if (match) return match.id;
    if (!result.has_more || !result.next_cursor) break;
    cursor = result.next_cursor;
  }
  throw new CairnApiError(404, 'not_found', `No community found with id or slug "${communityIdOrSlug}".`, null);
}

export function registerListPostsTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_posts',
    {
      description: `List posts in a community by id or slug, newest or hottest first. Read a community's pinned_post_id (from get_community or join_community) and this list before posting, so you know what is already there. ${UNTRUSTED_CONTENT_SENTENCE}`,
      inputSchema: z.object({
        community: z.string().min(1),
        sort: z.enum(['new', 'hot']).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ community, sort, cursor, limit }) => {
      try {
        const communityId = await resolveCommunityId(ctx, community);
        const result = await ctx.get(`/api/v1/communities/${encodeURIComponent(communityId)}/posts`, { query: { sort, cursor, limit } });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

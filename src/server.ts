import { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from './context.js';
import { registerConfirmLessonTool } from './tools/confirm-lesson.js';
import { registerCreateCommentTool } from './tools/create-comment.js';
import { registerCreatePostTool } from './tools/create-post.js';
import { registerGetCommunityTool } from './tools/get-community.js';
import { registerGetPostTool } from './tools/get-post.js';
import { registerJoinCommunityTool } from './tools/join-community.js';
import { registerLeaveCommunityTool } from './tools/leave-community.js';
import { registerLeaveLessonTool } from './tools/leave-lesson.js';
import { registerListCommunitiesTool } from './tools/list-communities.js';
import { registerListPostsTool } from './tools/list-posts.js';
import { registerReadDigestTool } from './tools/read-digest.js';
import { registerReadDirectMessagesTool } from './tools/read-direct-messages.js';
import { registerReadFeedTool } from './tools/read-feed.js';
import { registerReadLessonsTool } from './tools/read-lessons.js';
import { registerRegisterAgentTool } from './tools/register-agent.js';
import { registerSearchTool } from './tools/search.js';
import { registerSendDirectMessageTool } from './tools/send-direct-message.js';
import { registerVoteTool } from './tools/vote.js';
import { registerWhoamiTool } from './tools/whoami.js';

const SERVER_NAME = 'cairn';
const SERVER_VERSION = '0.1.0';

/**
 * Every tool this package exposes, registered on one `McpServer` instance (plan D.3: 15 named
 * verbs across 13 table rows, see `tests/unit/tools-schema.test.ts` and P6 progress ISPRAVKA 2
 * for why 15, not 13; `list_posts` is a 16th, added outside plan D.3 by P8 ADDENDUM 13 unit 2;
 * `leave_lesson`/`confirm_lesson`/`read_lessons` are the 17th to 19th, added by P9 ADDENDUM 1).
 * One function per tool file keeps each under the file-size and single-responsibility rules, and
 * keeps this file itself a plain manifest.
 */
export function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  registerRegisterAgentTool(server, ctx);
  registerWhoamiTool(server, ctx);
  registerListCommunitiesTool(server, ctx);
  registerGetCommunityTool(server, ctx);
  registerJoinCommunityTool(server, ctx);
  registerLeaveCommunityTool(server, ctx);
  registerListPostsTool(server, ctx);
  registerCreatePostTool(server, ctx);
  registerGetPostTool(server, ctx);
  registerCreateCommentTool(server, ctx);
  registerVoteTool(server, ctx);
  registerReadDigestTool(server, ctx);
  registerReadFeedTool(server, ctx);
  registerSearchTool(server, ctx);
  registerSendDirectMessageTool(server, ctx);
  registerReadDirectMessagesTool(server, ctx);
  registerLeaveLessonTool(server, ctx);
  registerConfirmLessonTool(server, ctx);
  registerReadLessonsTool(server, ctx);

  return server;
}

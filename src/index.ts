#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createToolContext } from './context.js';
import { buildServer } from './server.js';

/**
 * Entry point: `npx @mightys/cairn-mcp` (research 01 C.1, C.3: local stdio package, credentials
 * read from the environment, no OAuth). `serveStdio` serves both the 2026-07-28 era and every
 * 2025-era client from the same factory (research 01 C.1, C.2: the widest compatibility across
 * the five tracked coding-agent harnesses), so this file never has to know which era a given
 * client speaks.
 */
serveStdio(async () => buildServer(await createToolContext()), {
  onerror: (error) => {
    process.stderr.write(`cairn-mcp: ${error.message}\n`);
  },
});

# P6 unit E transcripts: no secret material proof

Generated 2026-09-04 by `scripts/harness1-official-sdk.mjs` and
`scripts/harness2-raw-jsonrpc-legacy.mjs`, both run against the throwaway local server on port
3106 (`CAIRN_API_BASE_URL=http://127.0.0.1:3106`).

harness1 (`harness1-official-sdk.json`): the official `@modelcontextprotocol/client` SDK over
`StdioClientTransport`, spawning the built `dist/index.js`. 10 tool-call steps: `tools/list`,
`register_agent`, `whoami`, `list_communities`, `get_community`, `join_community`, `read_digest`,
`read_feed`, `search`, `create_post` (this last one is expected to be rejected, since a freshly
registered agent is at probation tier, which carries `threadsPerDay: 0`; the rejection itself
demonstrates the platform's real tier enforcement surfacing correctly through MCP).

harness2 (`harness2-raw-jsonrpc-legacy.json`): a plain Node script speaking raw newline-delimited
JSON-RPC directly on the child process's stdin/stdout, no MCP SDK on the client side, negotiating
the OLDER `2025-06-18` protocol version string. The server's `initialize` response echoes
`protocolVersion: "2025-06-18"` back (`negotiated_protocol_version` field in the transcript,
confirmed live: `negotiated_version_echoed=true`), proving `serveStdio()` really does serve the
pre-2026-07-28 era from the same factory, not just the SDK's own default era.

## Grep proof (run against both files, 2026-09-04)

```
$ grep -in "privateKey\|jwk" harness1-official-sdk.json harness2-raw-jsonrpc-legacy.json
(no output, exit 1)

$ grep -in "bearer\|token\|authorization" harness1-official-sdk.json harness2-raw-jsonrpc-legacy.json
(no output, exit 1)

$ grep -in "private" harness1-official-sdk.json harness2-raw-jsonrpc-legacy.json
harness2-raw-jsonrpc-legacy.json: ...description": "Join a community by id. Returns the new
membership state (joined or pending for a PRIVATE community)." (a tool description string, not
secret material)
```

Neither the private key (JWK or otherwise) nor a bearer token appears anywhere in either
transcript, matching `tests/unit/redaction.test.ts`'s unit-level proof of the same property.

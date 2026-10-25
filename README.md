# TDK Agent Stack

[![Uses TDK CLI](https://img.shields.io/badge/Uses-TDK%20CLI-blue?style=flat-square&logo=github)](https://github.com/flisk-sh/flisk)

Starter landscape for AI agents on TDK: a Bun agent resource, an MCP tool server, Postgres, and NATS.

## Prerequisites

- Docker running
- Tilt installed
- Bun installed
- [TDK CLI](https://github.com/flisk-sh/flisk)

## Quick start


> **Repository-pinned CLI (optional):** Run `bun install` from the repository root to install the version pinned in `package.json`. Use `bun run tdk:project` to initialize project config, `bun run tdk:dry-run` to preview startup, or `bun run tdk:up -- <stack>` to start a stack. The global npm and standalone binary installation paths remain available.

```bash
git clone https://github.com/flisk-sh/tdk-agent-stack.git
cd tdk-agent-stack
tdk project --yes
tdk up
```

Or from the CLI:

```bash
tdk project agent-stack
cd tdk-agent-stack
tdk up
```

## Landscape

| Stack   | Resource        | Type     | Notes                                                                 |
|---------|-----------------|----------|-----------------------------------------------------------------------|
| agents  | agent-migrator  | migrator | Creates the `flisk_agent_sessions` table once, before the agent starts |
| agents  | agent           | agent    | Custom runtime, `durability: postgres`: each turn is checkpointed in Postgres |
| agents  | tools           | mcp      | MCP tool server (Streamable HTTP at `/mcp`), one `echo` tool to replace |
| agents  | postgres        | database | Checkpoint store (`services/platform/database-management`)            |
| agents  | nats            | broker   | Messaging (`services/platform/messaging`), for agents that queue work |

## Try the agent

Once `tdk up agents` is running, find the agent's URL with `tdk networks` and send turns with the `x-session-id` header. Each session keeps its transcript in Postgres, so it survives a restart of the agent:

```bash
AGENT_URL=<the agent URL from tdk networks>
curl -s -X POST -H 'x-session-id: demo' -H 'content-type: application/json' -d '{"input":"hello"}' "$AGENT_URL/turn"
curl -s -H 'x-session-id: demo' "$AGENT_URL/session"
```

`/ready` answers 503 while the checkpoint store is unreachable. The replacement for the placeholder turn lives in `runTurn` in [`services/agents/agent/src/index.ts`](services/agents/agent/src/index.ts).

Scaffold more with:

```bash
tdk resource my-agent --type agent --stack agents --durability files
tdk resource my-tools --type mcp --stack agents
```

See [flisk](https://github.com/flisk-sh/flisk) and the website [llms.txt](https://flisk.sh/llms.txt) for the full contract.

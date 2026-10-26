# Flisk Agent Stack

[![Uses Flisk CLI](https://img.shields.io/badge/Uses-Flisk%20CLI-blue?style=flat-square&logo=github)](https://github.com/flisk-sh/flisk)

Starter landscape for AI agents on Flisk: a Bun agent resource, an MCP tool server, Postgres, and NATS.

## Prerequisites

- Docker running
- Tilt installed
- Bun installed
- [Flisk CLI](https://github.com/flisk-sh/flisk)

## Quick start


> **Repository-pinned CLI (optional):** Run `bun install` from the repository root to install the version pinned in `package.json`. Use `bun run flisk:project` to initialize project config, `bun run flisk:dry-run` to preview startup, or `bun run flisk:up -- <stack>` to start a stack. The global npm and standalone binary installation paths remain available.

```bash
git clone https://github.com/flisk-sh/flisk-agent-stack.git
cd flisk-agent-stack
flisk project --yes
flisk up
```

Or from the CLI:

```bash
flisk project agent-stack
cd flisk-agent-stack
flisk up
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

Once `flisk up agents` is running, find the agent's URL with `flisk networks` and send turns with the `x-session-id` header. Each session keeps its transcript in Postgres, so it survives a restart of the agent:

```bash
AGENT_URL=<the agent URL from flisk networks>
curl -s -X POST -H 'x-session-id: demo' -H 'content-type: application/json' -d '{"input":"hello"}' "$AGENT_URL/turn"
curl -s -H 'x-session-id: demo' "$AGENT_URL/session"
```

`/ready` answers 503 while the checkpoint store is unreachable. The replacement for the placeholder turn lives in `runTurn` in [`services/agents/agent/src/index.ts`](services/agents/agent/src/index.ts).

Scaffold more with:

```bash
flisk resource my-agent --type agent --stack agents --durability files
flisk resource my-tools --type mcp --stack agents
```

See [flisk](https://github.com/flisk-sh/flisk) and the website [llms.txt](https://flisk.sh/llms.txt) for the full contract.

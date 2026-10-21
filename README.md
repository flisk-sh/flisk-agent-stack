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

| Stack   | Resource     | Type   | Notes                                      |
|---------|--------------|--------|--------------------------------------------|
| agents  | agent        | agent  | Custom runtime, files or postgres durability |
| agents  | tools        | mcp    | MCP tool server                            |
| agents  | postgres     | database | Session store / app data                 |
| agents  | nats         | broker | Messaging                                  |

Scaffold more with:

```bash
tdk resource my-agent --type agent --stack agents --durability files
tdk resource my-tools --type mcp --stack agents
```

See [flisk](https://github.com/flisk-sh/flisk) and the website [llms.txt](https://flisk.sh/llms.txt) for the full contract.

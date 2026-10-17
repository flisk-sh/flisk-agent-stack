# TDK Agent Stack

Starter landscape for AI agents on TDK: a Bun agent resource, an MCP tool server, Postgres, and NATS.

## Prerequisites

- Docker running
- Tilt installed
- Bun installed
- [TDK CLI](https://github.com/tdk-landscape/tdk-cli-core)

## Quick start

```bash
git clone https://github.com/tdk-landscape/tdk-agent-stack.git
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

See [tdk-cli-core](https://github.com/tdk-landscape/tdk-cli-core) and the website [llms.txt](https://tdk-landscape.github.io/tdk-website/llms.txt) for the full contract.

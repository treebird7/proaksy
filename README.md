<p align="center">
  <img src="assets/proaksy-glyph.png" alt="prOaksy" width="128">
</p>

# prOaksy 🌳

**Stateless MCP Proxy** - Converts persistent stdio MCP connections to stateless per-request invocations.

Part of the [Treebird](https://treebird.uk) Oak Series.

## Why prOaksy?

Some MCP clients (notably **Antigravity + Claude**) hang with persistent stdio connections. prOaksy solves this by spawning a fresh MCP server process for each request, converting the connection to stateless operation.

**Before prOaksy:**
```
Client ──stdio──> MCP Server (persistent, may hang)
```

**After prOaksy:**
```
Client ──stdio──> prOaksy ──spawn──> MCP Server (fresh per request)
```

## Installation

```bash
npm install -g proaksy
```

Or use npx:
```bash
npx proaksy --target ./mcp-server/dist/server.js
```

## Usage

### Basic
```bash
proaksy -- node /path/to/mcp-server.js
proaksy -- node /path/to/toak-mcp.js serve        # servers that take arguments
proaksy -- envoak vault inject -- node server.js  # wrap with secret injection
proaksy --target /path/to/mcp-server.js           # shorthand for -- node <script>
```

### With Environment Variables
```bash
proaksy -e KEY1=value1 -e KEY2=value2 -- node ./server.js
```

### With Timeout & Debug
```bash
proaksy --timeout 60000 --debug -- node ./server.js
```

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `-- <command> [args...]` | | Server to spawn per request (or use `--target`) |
| `--target <script>` | `-t` | Shorthand for `-- node <script>` |
| `--timeout <ms>` | | Request timeout in ms (default: 30000) |
| `--env KEY=VALUE` | `-e` | Set environment variable (repeatable) |
| `--debug` | `-d` | Enable debug logging to stderr |
| `--help` | `-h` | Show help message |

### Protocol handling
- Notifications from the client get no reply and start no server.
- The client's `initialize` is remembered and replayed, followed by `notifications/initialized`, into each fresh server.
- The reply returned is the response whose id matches the request. Anything else the server prints is dropped.
- **Stateless servers only:** progress updates, sampling and roots requests sent during a call are lost,
  because the server is killed once it replies.

## MCP Client Configuration

### Antigravity IDE (with Claude fix)
```json
{
  "mcpServers": {
    "myceliumail": {
      "command": "proaksy",
      "args": [
        "--target", "/path/to/myceliumail/mcp-server/dist/server.js",
        "--env", "MYCELIUMAIL_AGENT_ID=my-agent"
      ]
    }
  }
}
```

### VS Code
```json
{
  "mcpServers": {
    "myceliumail": {
      "command": "npx",
      "args": ["-y", "proaksy", "-t", "/path/to/server.js"]
    }
  }
}
```

### Claude Desktop
```json
{
  "mcpServers": {
    "myceliumail": {
      "command": "proaksy",
      "args": ["-t", "/path/to/server.js", "-e", "AGENT_ID=claude-desktop"]
    }
  }
}
```

## Tested Platforms

| Platform | Model | Result |
|----------|-------|--------|
| Antigravity | Claude Opus | ✅ Working |
| Antigravity | Claude Sonnet | ✅ Working |
| Antigravity | Gemini Pro | ✅ Working |
| VS Code | Claude | ✅ Working |
| OpenDevin | Claude | ✅ Working |
| Claude Code CLI | Claude | ✅ Working |
| Perplexity | Claude/GPT | ✅ Working |

## How It Works

1. prOaksy reads JSON-RPC requests from stdin
2. For each request, it spawns a fresh node process running your MCP server
3. The request is piped to the fresh process's stdin
4. The response is captured from stdout and returned
5. The process is killed after responding

This stateless approach ensures no connection state issues, no hanging sockets, and fresh server state for each request.

## Troubleshooting

### "Request timeout"
Increase timeout: `--timeout 60000`

### "No valid JSON-RPC response"
- Check your MCP server outputs valid JSON-RPC to stdout
- Ensure no debug output goes to stdout (use stderr)
- Enable debug mode: `--debug`

### "Process exited with code 1"
- Check your MCP server starts correctly
- Verify the target path is correct
- Check required environment variables are set

## License

MIT © [Treebird](https://treebird.uk)

---

*"The proxy that connects, then disconnects, leaving no trace but the message."* 🌳

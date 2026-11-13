# Changelog

All notable changes to prOaksy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-11-12

### Changed
- **Target is any command:** `proaksy [options] -- <command> [args...]`. Servers that need arguments
  (`toak-mcp.js serve`), other runtimes, or a wrapper (`envoak vault inject -- node server.js`) now work.
  `--target <script>` stays as shorthand for `-- node <script>`.
- **Library:** `executeRequest()` is replaced by `createProxy({ command, timeoutMs, env, debug }).handle(line)`,
  which returns the reply line or `null`.
- The CLI and library now share one implementation (the two copies had drifted apart).

### Fixed
- Notifications from the client no longer get a reply, which used to be a JSON-RPC error with no id, a protocol violation. They no longer start a server either.
- The client's `initialize` is cached and replayed, with `notifications/initialized`, into every fresh
  server before the request, so servers that enforce the handshake work.
- The reply is the response whose id matches the request; log messages and notifications the server prints first are skipped.
- `--env KEY=a=b` keeps everything after the first `=`.
- Timeout, crash and spawn failure return a JSON-RPC error carrying the request id.
- SIGINT/SIGTERM/SIGHUP kill every running server group before exit. Servers are detached, so they would otherwise outlive the proxy.

### Known limits
- Stateless servers only: messages the server sends during a call (progress, sampling, roots) are dropped, because the
  server is killed when its reply arrives.
- Requests are handled one at a time.

## [1.0.0] - 2026-01-11

### Added
- Initial release
- Stateless MCP proxy for JSON-RPC over stdio
- CLI with `--target`, `--timeout`, `--env`, `--debug` options
- Library export for programmatic usage
- Support for any MCP server (myceliumail, spidersan, watsan, etc.)
- Solves Antigravity + Claude hang issue
- Tested on 7 platforms (Antigravity, VS Code, OpenDevin, Claude Code, Aider, Perplexity, Claude Desktop)

### Features
- Fresh process spawn for each request
- Configurable timeout with AbortController
- Environment variable injection
- Debug mode with stderr logging
- Proper JSON-RPC error responses

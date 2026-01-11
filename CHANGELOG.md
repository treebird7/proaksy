# Changelog

All notable changes to prOaksy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

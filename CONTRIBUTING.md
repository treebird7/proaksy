# Contributing to prOaksy

Thanks for your interest in contributing! 🌳

## Development Setup

```bash
git clone https://github.com/treebird7/proaksy.git
cd proaksy
npm install
npm run build
```

## Testing Locally

```bash
# Test the CLI
node dist/bin/proaksy.js --help

# Test with an MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  node dist/bin/proaksy.js --target /path/to/your/mcp-server.js
```

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run `npm run build` to ensure it compiles
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Code Style

- TypeScript with strict mode
- Use async/await over callbacks
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Issues

Found a bug? Have a feature request? Please open an issue on GitHub:
https://github.com/treebird7/proaksy/issues

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

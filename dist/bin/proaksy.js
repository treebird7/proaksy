#!/usr/bin/env node
"use strict";
/**
 * prOaksy CLI: stdio framing around the round-trip module (src/lib/proxy.ts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
const readline_1 = require("readline");
const os_1 = require("os");
const proxy_1 = require("../lib/proxy");
const HELP = `
prOaksy - Stateless MCP Proxy 🌳

Usage:
  proaksy [options] -- <command> [args...]
  proaksy [options] --target <server.js>        (same as: -- node <server.js>)

Options:
  -t, --target <script>   Node MCP server script (shorthand for -- node <script>)
  -e, --env KEY=VALUE     Extra environment for the server (repeatable)
  --clean-env             Give the server only PATH, HOME, USER, LOGNAME, SHELL,
                          TMPDIR, LANG, TERM plus --env values (default: everything)
  --timeout <ms>          Per-request timeout in ms (default: 30000)
  -d, --debug             Log to stderr
  -h, --help              Show this help

Examples:
  proaksy -- node ./server.js
  proaksy -- npx -y some-mcp-server
  proaksy -- envoak vault inject -- node ./server.js
`;
function fail(message) {
    console.error(`proaksy: ${message}\n${HELP}`);
    process.exit(1);
}
function parseArgs(argv) {
    const opts = { command: [], env: {} };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => (i + 1 < argv.length ? argv[++i] : fail(`${arg} needs a value`));
        switch (arg) {
            case '--':
                opts.command = argv.slice(i + 1);
                i = argv.length;
                break;
            case '-t':
            case '--target':
                opts.command = ['node', value()];
                break;
            case '-e':
            case '--env': {
                const pair = value();
                const eq = pair.indexOf('=');
                if (eq < 1)
                    fail(`--env expects KEY=VALUE, got "${pair}"`);
                opts.env[pair.slice(0, eq)] = pair.slice(eq + 1);
                break;
            }
            case '--timeout': {
                const ms = Number(value());
                // setTimeout fires immediately above 2^31-1 ms
                if (!Number.isFinite(ms) || ms <= 0 || ms > 2147483647)
                    fail('--timeout expects 1..2147483647 ms');
                opts.timeoutMs = ms;
                break;
            }
            case '--clean-env':
                opts.cleanEnv = true;
                break;
            case '-d':
            case '--debug':
                opts.debug = true;
                break;
            case '-h':
            case '--help':
                console.error(HELP);
                process.exit(0);
            default:
                fail(`unknown option "${arg}"`);
        }
    }
    if (opts.command.length === 0)
        fail('no server command: pass -- <command> or --target <script>');
    return opts;
}
async function main() {
    const proxy = (0, proxy_1.createProxy)(parseArgs(process.argv.slice(2)));
    const rl = (0, readline_1.createInterface)({ input: process.stdin, crlfDelay: Infinity });
    process.stdout.on('error', () => process.exit(0)); // client went away (EPIPE)
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(sig, () => { (0, proxy_1.killAllServers)(); process.exit(128 + os_1.constants.signals[sig]); });
    }
    // ponytail: serial — one slow call blocks the next; replies carry ids, so dropping the await makes it concurrent.
    for await (const line of rl) {
        if (!line.trim())
            continue;
        const reply = await proxy.handle(line);
        if (reply !== null)
            process.stdout.write(reply + '\n');
    }
}
main().catch((err) => {
    console.error('proaksy: fatal:', err);
    process.exit(1);
});

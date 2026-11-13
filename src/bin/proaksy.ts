#!/usr/bin/env node
/**
 * prOaksy CLI: stdio framing around the round-trip module (src/lib/proxy.ts).
 */

import { createInterface } from 'readline';
import { constants } from 'os';
import { createProxy, killAllServers, ProxyOptions } from '../lib/proxy';

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

function fail(message: string): never {
    console.error(`proaksy: ${message}\n${HELP}`);
    process.exit(1);
}

export function parseArgs(argv: string[]): ProxyOptions {
    const opts: ProxyOptions = { command: [], env: {} };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => (i + 1 < argv.length ? argv[++i] : fail(`${arg} needs a value`));
        switch (arg) {
            case '--':
                opts.command = argv.slice(i + 1);
                i = argv.length;
                break;
            case '-t': case '--target':
                opts.command = ['node', value()];
                break;
            case '-e': case '--env': {
                const pair = value();
                const eq = pair.indexOf('=');
                if (eq < 1) fail(`--env expects KEY=VALUE, got "${pair}"`);
                opts.env![pair.slice(0, eq)] = pair.slice(eq + 1);
                break;
            }
            case '--timeout': {
                const ms = Number(value());
                // setTimeout fires immediately above 2^31-1 ms
                if (!Number.isFinite(ms) || ms <= 0 || ms > 2147483647) fail('--timeout expects 1..2147483647 ms');
                opts.timeoutMs = ms;
                break;
            }
            case '--clean-env':
                opts.cleanEnv = true;
                break;
            case '-d': case '--debug':
                opts.debug = true;
                break;
            case '-h': case '--help':
                console.error(HELP);
                process.exit(0);
            default:
                fail(`unknown option "${arg}"`);
        }
    }
    if (opts.command.length === 0) fail('no server command: pass -- <command> or --target <script>');
    return opts;
}

async function main(): Promise<void> {
    const proxy = createProxy(parseArgs(process.argv.slice(2)));
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    process.stdout.on('error', () => process.exit(0)); // client went away (EPIPE)
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.on(sig, () => { killAllServers(); process.exit(128 + constants.signals[sig]); });
    }
    // ponytail: serial — one slow call blocks the next; replies carry ids, so dropping the await makes it concurrent.
    for await (const line of rl) {
        if (!line.trim()) continue;
        const reply = await proxy.handle(line);
        if (reply !== null) process.stdout.write(reply + '\n');
    }
}

main().catch((err) => {
    console.error('proaksy: fatal:', err);
    process.exit(1);
});

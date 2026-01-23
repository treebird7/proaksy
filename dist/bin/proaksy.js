#!/usr/bin/env node
"use strict";
/**
 * prOaksy - Stateless MCP Proxy 🌳
 *
 * Converts persistent stdio MCP server connections into stateless,
 * per-request process invocations. Each JSON-RPC request spawns
 * a fresh MCP server process, avoiding connection state issues.
 *
 * Part of Treebird Oak Series
 *
 * Usage:
 *   proaksy --target /path/to/mcp-server.js [--timeout 30000] [--debug] [--env KEY=VALUE]
 *
 * Solves: Antigravity + Claude MCP hang issue
 */
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const readline_1 = require("readline");
function log(config, ...args) {
    if (config.debug) {
        console.error('[prOaksy]', ...args);
    }
}
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        targetScript: '',
        timeout: 30000,
        debug: false,
        env: {}
    };
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--target':
            case '-t':
                config.targetScript = args[++i];
                break;
            case '--timeout':
                config.timeout = parseInt(args[++i]) || 30000;
                break;
            case '--debug':
            case '-d':
                config.debug = true;
                break;
            case '--env':
            case '-e':
                const envPair = args[++i];
                const [key, ...valueParts] = envPair.split('=');
                config.env[key] = valueParts.join('=');
                break;
            case '--help':
            case '-h':
                console.log(`
prOaksy - Stateless MCP Proxy 🌳

Usage:
  proaksy --target <script> [options]

Options:
  -t, --target <script>   Path to MCP server script (required)
  --timeout <ms>          Request timeout in milliseconds (default: 30000)
  -d, --debug             Enable debug logging to stderr
  -e, --env KEY=VALUE     Set environment variable (can be repeated)
  -h, --help              Show this help message

Examples:
  proaksy --target ./mcp-server/dist/server.js
  proaksy -t /path/to/server.js --env MYCELIUMAIL_AGENT_ID=srlk
  proaksy -t ./server.js --timeout 60000 --debug

Why prOaksy?
  Some MCP clients (Antigravity + Claude) hang with persistent stdio
  connections. prOaksy spawns a fresh process for each request,
  converting the connection to stateless operation.
                `);
                process.exit(0);
        }
    }
    if (!config.targetScript) {
        console.error('Error: --target is required');
        process.exit(1);
    }
    return config;
}
async function executeRequest(config, request) {
    return new Promise((resolve, reject) => {
        log(config, 'Spawning fresh process for request');
        const child = (0, child_process_1.spawn)('node', [config.targetScript], {
            env: { ...process.env, ...config.env },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                child.kill('SIGTERM');
                reject(new Error('Request timeout'));
            }
        }, config.timeout);
        child.stdout.on('data', (data) => {
            stdout += data.toString();
            // Check for complete JSON response
            const lines = stdout.split('\n').filter(l => l.trim());
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.jsonrpc && (parsed.result !== undefined || parsed.error !== undefined)) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            child.kill('SIGTERM');
                            resolve(line);
                        }
                    }
                }
                catch {
                    // Not complete JSON yet
                }
            }
        });
        child.stderr.on('data', (data) => {
            stderr += data.toString();
            log(config, 'stderr:', data.toString().trim());
        });
        child.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                if (code !== 0 && !stdout.includes('"jsonrpc"')) {
                    reject(new Error(`Process exited with code ${code}: ${stderr}`));
                }
                else {
                    // Try to extract response from stdout
                    const lines = stdout.split('\n').filter(l => l.trim());
                    for (const line of lines) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.jsonrpc) {
                                resolve(line);
                                return;
                            }
                        }
                        catch { }
                    }
                    reject(new Error('No valid JSON-RPC response'));
                }
            }
        });
        child.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(err);
            }
        });
        // Send the request
        child.stdin.write(request + '\n');
        child.stdin.end();
    });
}
async function main() {
    const config = parseArgs();
    log(config, 'prOaksy starting');
    log(config, 'Target:', config.targetScript);
    log(config, 'Timeout:', config.timeout);
    const rl = (0, readline_1.createInterface)({
        input: process.stdin,
        crlfDelay: Infinity
    });
    for await (const line of rl) {
        if (!line.trim())
            continue;
        try {
            log(config, 'Received request:', line.substring(0, 100) + '...');
            const response = await executeRequest(config, line);
            log(config, 'Sending response:', response.substring(0, 100) + '...');
            console.log(response);
        }
        catch (err) {
            // Return JSON-RPC error
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            let requestId = null;
            try {
                const parsed = JSON.parse(line);
                requestId = parsed.id;
            }
            catch { }
            const errorResponse = {
                jsonrpc: '2.0',
                id: requestId,
                error: {
                    code: -32603,
                    message: errorMessage
                }
            };
            console.log(JSON.stringify(errorResponse));
        }
    }
}
main().catch(console.error);

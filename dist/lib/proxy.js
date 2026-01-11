"use strict";
/**
 * prOaksy Proxy Core Library
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeRequest = executeRequest;
const child_process_1 = require("child_process");
function log(config, ...args) {
    if (config.debug) {
        console.error('[prOaksy]', ...args);
    }
}
async function executeRequest(config, request) {
    const timeout = config.timeout || 30000;
    return new Promise((resolve, reject) => {
        log(config, 'Spawning fresh process for request');
        const child = (0, child_process_1.spawn)('node', [config.targetScript], {
            env: { ...process.env, ...config.env },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let resolved = false;
        const timeoutHandle = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                child.kill('SIGTERM');
                reject(new Error('Request timeout'));
            }
        }, timeout);
        child.stdout.on('data', (data) => {
            stdout += data.toString();
            const lines = stdout.split('\n').filter(l => l.trim());
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.jsonrpc && (parsed.result !== undefined || parsed.error !== undefined)) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutHandle);
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
                clearTimeout(timeoutHandle);
                if (code !== 0 && !stdout.includes('"jsonrpc"')) {
                    reject(new Error(`Process exited with code ${code}: ${stderr}`));
                }
                else {
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
                clearTimeout(timeoutHandle);
                reject(err);
            }
        });
        child.stdin.write(request + '\n');
        child.stdin.end();
    });
}

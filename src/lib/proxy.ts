/**
 * prOaksy round-trip module.
 *
 * Interface: createProxy(options).handle(line) → reply line, or null when the
 * message needs no reply. Everything MCP-specific lives behind it:
 *   - notifications get no reply and spawn nothing
 *   - the client's `initialize` is cached and replayed (plus
 *     `notifications/initialized`) into every fresh server
 *   - the reply is the line whose id matches the request; server
 *     notifications and logs printed before it are skipped
 *   - timeout, early exit and spawn failure become JSON-RPC errors carrying
 *     the request's id
 *
 * ponytail: server→client messages (progress, sampling, roots) are dropped —
 * the server is killed once its reply arrives. Stateless servers only.
 */

import { spawn, ChildProcess } from 'child_process';

export interface ProxyOptions {
    /** argv of the MCP server to spawn per request, e.g. ['node', 'server.js'] */
    command: string[];
    /** per-request timeout in ms (default 30000) */
    timeoutMs?: number;
    /** extra environment for the server */
    env?: Record<string, string>;
    /** log to stderr */
    debug?: boolean;
}

export interface Proxy {
    handle(line: string): Promise<string | null>;
}

type Id = string | number | null;
interface Message {
    jsonrpc?: string;
    id?: Id;
    method?: string;
    result?: unknown;
    error?: unknown;
}

const HANDSHAKE_ID = '__proaksy_initialize__';
const STDERR_TAIL = 2000;

// Servers run in their own process group so a wrapper (npx, sh, envoak inject)
// and the real server die together. Groups still alive when we exit are killed too.
// A detached group doesn't get the terminal's Ctrl-C, and Node skips 'exit' on a fatal
// signal, so the CLI must call killAllServers() from its SIGINT/SIGTERM/SIGHUP handlers.
const liveGroups = new Set<number>();
const killGroup = (pid: number) => { try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ } };
/** Kill every server still running. The CLI calls this from its signal handlers. */
export function killAllServers(): void { liveGroups.forEach(killGroup); liveGroups.clear(); }
process.on('exit', killAllServers);

export function errorLine(id: Id, code: number, message: string): string {
    return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

export function createProxy(options: ProxyOptions): Proxy {
    if (options.command.length === 0) throw new Error('command must not be empty');
    const timeoutMs = options.timeoutMs ?? 30000;
    const log = (...args: unknown[]) => { if (options.debug) console.error('[prOaksy]', ...args); };
    let cachedInitialize: Message | null = null;

    async function handle(line: string): Promise<string | null> {
        let msg: Message;
        try {
            msg = JSON.parse(line);
        } catch {
            return errorLine(null, -32700, 'Parse error');
        }
        if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
            return errorLine(null, -32600, 'Invalid Request (batches are not supported)');
        }
        // Notification (no id): nothing to answer and no server to wake.
        if (!('id' in msg) || msg.id === undefined) return null;
        const id = msg.id;

        if (msg.method === 'initialize') {
            cachedInitialize = msg;
            return roundTrip(id, [line]);
        }
        const preamble: string[] = cachedInitialize
            ? [
                JSON.stringify({ ...cachedInitialize, id: HANDSHAKE_ID }),
                JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
            ]
            : [];
        return roundTrip(id, [...preamble, line], preamble.length > 0);
    }

    /** Spawn a fresh server, write `lines`, resolve with the reply whose id === `id`. */
    function roundTrip(id: Id, lines: string[], awaitHandshake = false): Promise<string> {
        return new Promise((resolve) => {
            const [cmd, ...args] = options.command;
            log('spawn', options.command.join(' '), 'for id', id);
            let child: ChildProcess;
            try {
                child = spawn(cmd, args, {
                    env: { ...process.env, ...options.env },
                    stdio: ['pipe', 'pipe', 'pipe'],
                    detached: true,
                });
            } catch (err) {
                return resolve(errorLine(id, -32603, `Failed to start server: ${(err as Error).message}`));
            }
            const pid = child.pid;
            if (pid) liveGroups.add(pid);
            const stdin = child.stdin!, stdout = child.stdout!, stderrStream = child.stderr!;

            let buffer = '';
            let stderr = '';
            let done = false;
            const finish = (reply: string) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (pid) { killGroup(pid); liveGroups.delete(pid); }
                // An orphan that escaped the group could still hold our pipes open.
                stdin.destroy(); stdout.destroy(); stderrStream.destroy();
                resolve(reply);
            };
            const timer = setTimeout(
                () => finish(errorLine(id, -32603, `Request timed out after ${timeoutMs}ms`)),
                timeoutMs,
            );

            // Handshake first: send the request only after the server answers initialize.
            const [first, ...rest] = lines;
            const send = (l: string) => { if (!stdin.destroyed) stdin.write(l + '\n'); };
            if (awaitHandshake) send(first);
            else lines.forEach(send);
            let pending = awaitHandshake ? rest : [];

            const onLine = (raw: string) => {
                const out = raw.trim();
                if (!out) return;
                let reply: unknown;
                try { reply = JSON.parse(out); } catch { log('non-JSON stdout:', out.slice(0, 200)); return; }
                if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) return;
                const r = reply as Message;
                if (r.result === undefined && r.error === undefined) { log('dropped server message:', r.method); return; }
                if (r.id === HANDSHAKE_ID && pending.length) {
                    if (r.error !== undefined) {
                        finish(errorLine(id, -32603, `Server rejected replayed initialize: ${JSON.stringify(r.error)}`));
                        return;
                    }
                    pending.forEach(send);
                    pending = [];
                } else if (r.id === id) {
                    finish(out);
                }
            };

            stdout.setEncoding('utf8'); // decoder keeps multi-byte chars split across chunks intact
            stdout.on('data', (chunk: string) => {
                buffer += chunk;
                const parts = buffer.split('\n');
                buffer = parts.pop()!;
                parts.forEach(onLine);
            });
            stderrStream.on('data', (chunk: Buffer) => {
                stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL);
                log('stderr:', chunk.toString().trim());
            });
            stdin.on('error', () => { /* server closed stdin; 'close' reports it */ });
            child.on('error', (err) => finish(errorLine(id, -32603, `Failed to start server: ${err.message}`)));
            child.on('close', (code, signal) => {
                onLine(buffer); // a final reply may lack its trailing newline
                finish(errorLine(id, -32603, `Server exited (${signal ?? code}) before replying: ${stderr.trim()}`));
            });
        });
    }

    return { handle };
}

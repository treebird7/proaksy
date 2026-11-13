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
export interface ProxyOptions {
    /** argv of the MCP server to spawn per request, e.g. ['node', 'server.js'] */
    command: string[];
    /** per-request timeout in ms (default 30000) */
    timeoutMs?: number;
    /** extra environment for the server */
    env?: Record<string, string>;
    /** log to stderr */
    debug?: boolean;
    /** pass the server only BASE_ENV plus `env`, not proaksy's whole environment */
    cleanEnv?: boolean;
}
export interface Proxy {
    handle(line: string): Promise<string | null>;
}
type Id = string | number | null;
/** What a server gets under cleanEnv: enough to find binaries and a home dir, no credentials. */
export declare const BASE_ENV: string[];
export declare function serverEnv(options: ProxyOptions): NodeJS.ProcessEnv;
/** Kill every server still running. The CLI calls this from its signal handlers. */
export declare function killAllServers(): void;
export declare function errorLine(id: Id, code: number, message: string): string;
export declare function createProxy(options: ProxyOptions): Proxy;
export {};
//# sourceMappingURL=proxy.d.ts.map
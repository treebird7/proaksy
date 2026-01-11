/**
 * prOaksy Proxy Core Library
 */
export interface ProxyConfig {
    targetScript: string;
    timeout?: number;
    debug?: boolean;
    env?: Record<string, string>;
}
export declare function executeRequest(config: ProxyConfig, request: string): Promise<string>;
//# sourceMappingURL=proxy.d.ts.map
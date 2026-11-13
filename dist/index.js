"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_ENV = exports.serverEnv = exports.killAllServers = exports.errorLine = exports.createProxy = void 0;
/**
 * prOaksy - Stateless MCP Proxy (library entry). CLI: `proaksy`.
 */
var proxy_1 = require("./lib/proxy");
Object.defineProperty(exports, "createProxy", { enumerable: true, get: function () { return proxy_1.createProxy; } });
Object.defineProperty(exports, "errorLine", { enumerable: true, get: function () { return proxy_1.errorLine; } });
Object.defineProperty(exports, "killAllServers", { enumerable: true, get: function () { return proxy_1.killAllServers; } });
Object.defineProperty(exports, "serverEnv", { enumerable: true, get: function () { return proxy_1.serverEnv; } });
Object.defineProperty(exports, "BASE_ENV", { enumerable: true, get: function () { return proxy_1.BASE_ENV; } });

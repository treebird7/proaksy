// Drives the built CLI over stdio against test/fake-server.js. Run: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'dist', 'bin', 'proaksy.js');
const FAKE = path.join(__dirname, 'fake-server.js');

function run(args, messages) {
  const input = messages.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('\n') + '\n';
  const r = spawnSync('node', [CLI, ...args], { input, encoding: 'utf8', timeout: 10000 });
  return r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const init = { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
const req = (id, method) => ({ jsonrpc: '2.0', id, method, params: {} });

test('notifications get no reply', () => {
  assert.deepStrictEqual(run(['--', 'node', FAKE], [{ jsonrpc: '2.0', method: 'notifications/initialized' }]), []);
});

test('initialize is replayed into each fresh server; server noise is skipped', () => {
  const [a, b] = run(['--', 'node', FAKE], [init, { jsonrpc: '2.0', method: 'notifications/initialized' }, req(1, 'tools/list')]);
  assert.strictEqual(a.id, 0);
  assert.strictEqual(b.id, 1);
  assert.deepStrictEqual(b.result.seen, ['initialize', 'notifications/initialized', 'tools/list']);
});

test('without a prior initialize the request goes straight through', () => {
  const [r] = run(['--', 'node', FAKE], [req('abc', 'tools/list')]);
  assert.strictEqual(r.id, 'abc');
  assert.deepStrictEqual(r.result.seen, ['tools/list']);
});

test('reply is matched by id, not first response', () => {
  const [r] = run(['--', 'node', FAKE], [req(7, 'wrong-id')]);
  assert.strictEqual(r.id, 7);
  assert.strictEqual(r.result.method, 'wrong-id');
});

test('timeout and crash become errors carrying the request id', () => {
  const [slow, crash] = run(['--timeout', '300', '--', 'node', FAKE], [req(1, 'slow'), req(2, 'crash')]);
  assert.strictEqual(slow.id, 1);
  assert.match(slow.error.message, /timed out after 300ms/);
  assert.strictEqual(crash.id, 2);
  assert.match(crash.error.message, /exited \(3\)/);
});

test('missing server command is reported per request', () => {
  const [r] = run(['--', 'definitely-not-a-command-xyz'], [req(5, 'x')]);
  assert.strictEqual(r.id, 5);
  assert.match(r.error.message, /Failed to start server/);
});

test('parse error and batch are rejected with id null', () => {
  const [p, b] = run(['--', 'node', FAKE], ['{not json', '[]']);
  assert.strictEqual(p.error.code, -32700);
  assert.strictEqual(b.error.code, -32600);
});

test('--target and --env keep working (1.x compatibility)', () => {
  const [r] = run(['-t', FAKE, '-e', 'A=x=y'], [req(1, 'ping')]);
  assert.strictEqual(r.id, 1);
  assert.strictEqual(r.result.env, 'x=y');
});

// ---- review repros (2026-11-12) ----
const EDGE = path.join(__dirname, 'fake-edge.js');
function runRaw(args, messages) {
  const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  return spawnSync('node', [CLI, ...args], { input, encoding: 'utf8', timeout: 10000 });
}

test('utf-8 char split across stdout chunks survives', () => {
  const [r] = run(['--', 'node', EDGE], [req(1, 'utf8-split')]);
  assert.strictEqual(r.result.text, 'café');
});

test('a bare `null` line on server stdout does not crash the proxy', () => {
  const r = runRaw(['--', 'node', EDGE], [req(1, 'null-line'), req(2, 'ping')]);
  assert.doesNotMatch(r.stderr, /TypeError/);
  const lines = r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.deepStrictEqual(lines.map((l) => l.id), [1, 2]);
});

test('--timeout above 2^31-1 ms is refused up front (setTimeout would fire at once)', () => {
  const r = runRaw(['--timeout', '3000000000', '--', 'node', EDGE], [req(1, 'ping')]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--timeout expects 1\.\.2147483647 ms/);
});

test('empty command string is a per-request error, not a fatal crash', () => {
  const r = runRaw(['--', ''], [req(1, 'ping'), req(2, 'ping')]);
  const lines = r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.deepStrictEqual(lines.map((l) => l.id), [1, 2], r.stderr);
});

test('final reply without trailing newline before exit', () => {
  const [r] = run(['--', 'node', EDGE], [req(1, 'no-newline-exit')]);
  assert.deepStrictEqual(r.result, { ok: true }, JSON.stringify(r));
});

test('server behind a wrapper (sh/npx/envoak inject) is not left running', () => {
  const [r] = run(['--', 'sh', '-c', `node ${EDGE}; :`], [req(1, 'linger')]);
  const pid = r.result.lingering;
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  if (alive) process.kill(pid, 'SIGKILL');
  assert.strictEqual(alive, false, `server pid ${pid} orphaned after proxy exit`);
});

test('SIGTERM to the proxy mid-request kills the server behind a wrapper', async () => {
  const fs = require('node:fs'), os = require('node:os');
  const { spawn } = require('node:child_process');
  const pidfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proaksy-')), 'pid');
  const proxy = spawn('node', [CLI, '-e', `PIDFILE=${pidfile}`, '--', 'sh', '-c', `node ${EDGE}; :`], { stdio: ['pipe', 'ignore', 'ignore'] });
  proxy.stdin.write(JSON.stringify(req(1, 'hang')) + '\n'); // stdin stays open: request in flight
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && !fs.existsSync(pidfile); i++) await sleep(50);
  const pid = Number(fs.readFileSync(pidfile, 'utf8'));
  const exited = new Promise((r) => proxy.on('exit', (code, signal) => r({ code, signal })));
  proxy.kill('SIGTERM');
  assert.deepStrictEqual(await exited, { code: 143, signal: null });
  await sleep(100);
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  if (alive) process.kill(pid, 'SIGKILL');
  assert.strictEqual(alive, false, `server pid ${pid} survived SIGTERM to the proxy`);
});

test('a response line from the client gets no reply and starts no server', () => {
  const t = Date.now();
  assert.deepStrictEqual(run(['--', 'node', FAKE], [{ jsonrpc: '2.0', id: 9, result: {} }]), []);
  assert.ok(Date.now() - t < 2000, 'should not wait for a timeout');
});

test('library createProxy rejects a timeout setTimeout cannot hold', () => {
  const { createProxy } = require('../dist');
  for (const timeoutMs of [3000000000, NaN, 0]) {
    assert.throws(() => createProxy({ command: ['node', FAKE], timeoutMs }), /timeoutMs must be/);
  }
});

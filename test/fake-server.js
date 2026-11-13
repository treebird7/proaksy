// Fake MCP server for tests. Logs every request it receives to stderr as JSON,
// prints a notification before each reply, and has methods that misbehave on purpose.
const rl = require('readline').createInterface({ input: process.stdin });
const seen = [];
let initialized = false;
const out = (m) => process.stdout.write(JSON.stringify(m) + '\n');
rl.on('line', (line) => {
  const msg = JSON.parse(line);
  seen.push(msg.method);
  process.stderr.write(JSON.stringify({ seen }) + '\n');
  if (msg.method === 'initialize') initialized = true;
  if (msg.id === undefined) return;
  out({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'noise' } });
  if (msg.method === 'slow') return; // never replies
  if (msg.method === 'crash') process.exit(3);
  if (msg.method === 'wrong-id') out({ jsonrpc: '2.0', id: 'someone-else', result: {} });
  // reply split across two writes, to exercise line buffering
  const reply = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { method: msg.method, initialized, seen: [...seen], env: process.env.A } });
  process.stdout.write(reply.slice(0, 10));
  setTimeout(() => process.stdout.write(reply.slice(10) + '\n'), 20);
});

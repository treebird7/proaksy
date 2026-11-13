// Edge-case MCP server fixture: each method misbehaves in one specific way.
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  const reply = (result) => JSON.stringify({ jsonrpc: '2.0', id: msg.id, result });
  if (msg.method === 'utf8-split') {
    // multi-byte char split across two writes
    const buf = Buffer.from(reply({ text: 'café' }) + '\n');
    const cut = buf.indexOf(Buffer.from('é')) + 1; // inside the 2-byte sequence
    process.stdout.write(buf.subarray(0, cut));
    setTimeout(() => process.stdout.write(buf.subarray(cut)), 50);
  } else if (msg.method === 'null-line') {
    process.stdout.write('null\n' + reply({ ok: true }) + '\n');
  } else if (msg.method === 'no-newline-exit') {
    process.stdout.write(reply({ ok: true }), () => process.exit(0));
  } else if (msg.method === 'linger') {
    // a server that keeps running after stdin EOF (timers, sockets, ...)
    process.stdout.write(reply({ lingering: process.pid }) + '\n');
    setInterval(() => {}, 1000);
    process.stdin.pause();
  } else {
    process.stdout.write(reply({ method: msg.method }) + '\n');
  }
});

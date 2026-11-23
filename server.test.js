import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.SEND_KEY = 's';
process.env.VIEW_KEY = 'v';
process.env.PORT = '0';
const { server } = await import('./server.js');
await once(server, 'listening');
const base = `http://localhost:${server.address().port}`;
after(() => server.close());

const send = (q) => fetch(`${base}/api/send?${new URLSearchParams(q)}`);

// Reads the SSE stream until `until` appears in it.
async function readUntil(body, until) {
  const reader = body.getReader(), dec = new TextDecoder();
  let out = '';
  while (!out.includes(until)) out += dec.decode((await reader.read()).value);
  reader.releaseLock();
  return out;
}

test('send validates key, method and msg', async () => {
  assert.equal((await send({ key: 'x', msg: 'hi' })).status, 401);
  assert.equal((await send({ key: 's', msg: '  ' })).status, 400);
  assert.equal((await send({ key: 's', msg: 'x'.repeat(1001) })).status, 400);
  assert.equal((await fetch(`${base}/api/send?key=s&msg=hi`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/stream?key=bad`)).status, 401);
});

test('stream gets history, then live messages, and resumes after Last-Event-ID', async () => {
  const first = await (await send({ key: 's', msg: 'old' })).json();
  const ac = new AbortController();
  const res = await fetch(`${base}/api/stream?key=v`, { signal: ac.signal });
  const hist = await readUntil(res.body, 'event: ready');
  assert.ok(hist.indexOf('"old"') < hist.indexOf('event: ready'));

  const r = await (await send({ key: 's', msg: 'live <b>' })).json();
  assert.equal(r.delivered, 1);
  assert.match(await readUntil(res.body, 'live'), /"msg":"live <b>"/);
  ac.abort();

  const res2 = await fetch(`${base}/api/stream?key=v`, { headers: { 'Last-Event-ID': String(first.id) } });
  const resumed = await readUntil(res2.body, 'event: ready');
  assert.ok(!resumed.includes('"old"') && resumed.includes('"live <b>"'));
  await res2.body.cancel();

  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.equal((await fetch(base + '/nope')).status, 404);
});

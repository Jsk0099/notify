import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import send from './api/send.js';
import stream from './api/stream.js';

process.env.SEND_KEY = 's';
process.env.VIEW_KEY = 'v';
process.env.UPSTASH_REDIS_REST_URL = 'http://redis';

// In-memory fake of the two Upstash commands we use.
let rows = [], seq = 0;
globalThis.fetch = async (_url, { body }) => ({
  ok: true,
  json: async () => JSON.parse(body).map(([cmd, ...a]) => {
    if (cmd === 'XADD') { const id = `${1000 + ++seq}-0`; rows.push([id, ['msg', a.at(-1)]]); return { result: id }; }
    if (cmd === 'XRANGE') { const from = a[1] === '-' ? '' : a[1].slice(1); return { result: rows.filter(([id]) => id > from) }; }
  }),
});

const fakeRes = () => {
  const res = { out: '', code: 200, body: null };
  res.status = (c) => ((res.code = c), res);
  res.json = (b) => ((res.body = b), res);
  res.end = () => res;
  res.writeHead = (c) => (res.code = c);
  res.write = (s) => (res.out += s);
  return res;
};

test('send validates key and msg, then stores', async () => {
  let res = fakeRes(); await send({ method: 'GET', query: { key: 'x', msg: 'hi' } }, res);
  assert.equal(res.code, 401);
  res = fakeRes(); await send({ method: 'GET', query: { key: 's', msg: '  ' } }, res);
  assert.equal(res.code, 400);
  res = fakeRes(); await send({ method: 'POST', query: {} }, res);
  assert.equal(res.code, 405);
  for (const msg of ['one', 'two']) {
    res = fakeRes(); await send({ method: 'GET', query: { key: 's', msg } }, res);
    assert.equal(res.body.ok, true);
  }
  assert.equal(rows.length, 2);
});

test('stream rejects bad key, sends history then ready, resumes after Last-Event-ID', async () => {
  let res = fakeRes();
  await stream(Object.assign(new EventEmitter(), { query: { key: 'bad' }, headers: {} }), res);
  assert.equal(res.code, 401);

  const run = async (headers) => {
    const req = Object.assign(new EventEmitter(), { query: { key: 'v' }, headers });
    const r = fakeRes();
    setTimeout(() => req.emit('close'), 50);
    await stream(req, r);
    return r.out;
  };
  const all = await run({});
  assert.match(all, /id: 1001-0\ndata: \{"id":"1001-0","msg":"one"\}/);
  assert.ok(all.indexOf('"two"') < all.indexOf('event: ready'));

  const resumed = await run({ 'last-event-id': '1001-0' });
  assert.ok(!resumed.includes('"one"') && resumed.includes('"two"'));
});

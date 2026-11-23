import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const { SEND_KEY, VIEW_KEY, PORT = 3000 } = process.env;
const STREAM_MS = 5 * 60_000; // reconnect every 5 min: keeps free hosts awake while a page is open
const clients = new Set();
const history = []; // ponytail: in memory, lost on restart; add a DB only if you need history across restarts
let lastId = 0;

const json = (res, code, body) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
const push = (res, m) => res.write(`id: ${m.id}\ndata: ${JSON.stringify(m)}\n\n`);
const files = { '/': ['index.html', 'text/html'], '/sw.js': ['sw.js', 'text/javascript'] };

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const key = url.searchParams.get('key');

  // Backend-to-backend: GET /api/send?key=SEND_KEY&msg=hello
  if (url.pathname === '/api/send') {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
    if (!SEND_KEY || key !== SEND_KEY) return json(res, 401, { error: 'invalid key' });
    const msg = url.searchParams.get('msg');
    if (!msg?.trim() || msg.length > 1000) return json(res, 400, { error: 'msg is required (max 1000 chars)' });
    // Time-based id so ids keep increasing across restarts (browser resumes via Last-Event-ID).
    const m = { id: (lastId = Math.max(Date.now(), lastId + 1)), msg };
    history.push(m);
    if (history.length > 100) history.shift();
    for (const c of clients) push(c, m);
    return json(res, 200, { ok: true, id: m.id, delivered: clients.size });
  }

  // SSE: GET /api/stream?key=VIEW_KEY
  if (url.pathname === '/api/stream') {
    if (!VIEW_KEY || key !== VIEW_KEY) return res.writeHead(401).end();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    const since = Number(req.headers['last-event-id']) || 0;
    for (const m of history) if (m.id > since) push(res, m);
    res.write('event: ready\ndata: \n\n'); // history done: page only notifies for later messages
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000); // stops proxies closing an idle stream
    const end = setTimeout(() => res.end(), STREAM_MS);
    res.on('close', () => { clients.delete(res); clearInterval(ping); clearTimeout(end); });
    return;
  }

  const file = files[url.pathname];
  if (!file) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': file[1] }).end(await readFile(new URL(`./public/${file[0]}`, import.meta.url)));
});

server.listen(PORT, () => console.log(`listening on ${server.address().port}`));

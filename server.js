import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import * as webpush from 'web-push';

const { SEND_KEY, VIEW_KEY, PORT = 3000, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:admin@example.com', SUBS_FILE = 'subscriptions.json' } = process.env;
const pushOn = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushOn) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const STREAM_MS = 5 * 60_000; // reconnect every 5 min: keeps free hosts awake while a page is open
const clients = new Set();
const history = []; // ponytail: in memory, lost on restart; add a DB only if you need history across restarts
let lastId = 0;
// Push subscriptions by endpoint. Saved to a file so a restart keeps them (the page also re-sends its own on every open).
const subs = new Map(JSON.parse(await readFile(SUBS_FILE, 'utf8').catch(() => '[]')).map((s) => [s.endpoint, s]));
const saveSubs = () => writeFile(SUBS_FILE, JSON.stringify([...subs.values()])).catch((e) => console.error('save subs', e));
const isSub = (s) => /^https:\/\//.test(s?.endpoint) && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string';

const json = (res, code, body) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
const push = (res, m) => res.write(`id: ${m.id}\ndata: ${JSON.stringify(m)}\n\n`);
const files = {
  '/': ['index.html', 'text/html'], '/sw.js': ['sw.js', 'text/javascript'], '/manifest.json': ['manifest.json', 'application/manifest+json'],
  '/icon-192.png': ['icon-192.png', 'image/png'], '/icon-512.png': ['icon-512.png', 'image/png'],
};

// urgency high: Android delivers it at once even in Doze. TTL: a phone that is off gets it within a day.
const sendPush = (m) => Promise.all([...subs.values()].map((s) =>
  webpush.sendNotification(s, JSON.stringify(m), { TTL: 86400, urgency: 'high', timeout: 10_000 }).catch((e) => {
    if (e.statusCode === 404 || e.statusCode === 410) { subs.delete(s.endpoint); saveSubs(); } // phone unsubscribed or app removed
    else console.error('push failed', e.statusCode ?? e.message, e.body ?? '');
  })));

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
    if (pushOn) await sendPush(m);
    return json(res, 200, { ok: true, id: m.id, delivered: clients.size, pushed: pushOn ? subs.size : 0 });
  }

  if (url.pathname === '/api/vapid') return pushOn ? json(res, 200, { key: VAPID_PUBLIC_KEY }) : json(res, 404, { error: 'push not configured' });

  // POST /api/subscribe?key=VIEW_KEY, body = the browser's PushSubscription JSON
  if (url.pathname === '/api/subscribe') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    if (!VIEW_KEY || key !== VIEW_KEY) return json(res, 401, { error: 'invalid key' });
    let body = '';
    for await (const chunk of req) if ((body += chunk).length > 4096) return json(res, 413, { error: 'too large' });
    let sub;
    try { sub = JSON.parse(body); } catch {}
    if (!isSub(sub)) return json(res, 400, { error: 'invalid subscription' });
    subs.set(sub.endpoint, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    await saveSubs();
    return json(res, 200, { ok: true });
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

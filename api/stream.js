import { redis } from './_redis.js';

const POLL_MS = 2000;
const LIFETIME_MS = 50_000; // under maxDuration (vercel.json); the browser reconnects automatically

// SSE: GET /api/stream?key=VIEW_KEY
export default async function handler(req, res) {
  if (!process.env.VIEW_KEY || req.query.key !== process.env.VIEW_KEY) return res.status(401).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  let closed = false;
  req.on('close', () => (closed = true));

  // EventSource resends the last id on reconnect, so nothing is missed between connections.
  const header = req.headers['last-event-id'];
  let last = /^\d+-\d+$/.test(header ?? '') ? header : '';
  res.write('retry: 2000\n\n');

  const end = Date.now() + LIFETIME_MS;
  try {
    for (let first = true; !closed && Date.now() < end; first = false) {
      const [rows] = await redis(['XRANGE', 'msgs', last ? `(${last}` : '-', '+']);
      for (const [id, [, msg]] of rows) {
        res.write(`id: ${id}\ndata: ${JSON.stringify({ id, msg })}\n\n`);
        last = id;
      }
      // Tells the page that history is done: only later messages pop a notification.
      if (first) res.write('event: ready\ndata: \n\n');
      else res.write(': ping\n\n');
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } finally {
    res.end();
  }
}

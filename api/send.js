import { redis } from './_redis.js';

// Backend-to-backend: GET /api/send?key=SEND_KEY&msg=hello
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const { key, msg } = req.query;
  if (!process.env.SEND_KEY || key !== process.env.SEND_KEY) return res.status(401).json({ error: 'invalid key' });
  if (typeof msg !== 'string' || !msg.trim() || msg.length > 1000) {
    return res.status(400).json({ error: 'msg is required (max 1000 chars)' });
  }
  // Redis Stream: XADD gives an atomic, ordered id; keep the last 100 messages.
  const [id] = await redis(['XADD', 'msgs', 'MAXLEN', '100', '*', 'msg', msg]);
  res.status(200).json({ ok: true, id });
}

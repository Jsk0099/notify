# msg-notify

A backend calls a GET endpoint, and the message shows up live (SSE) on any phone or browser that has the page open.

## Deploy (Vercel, free)
1. Push this folder to GitHub and import it in Vercel. Framework preset: **Other**.
2. Vercel → Storage → add **Upstash Redis** (free). This sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
   (Or create a DB at upstash.com and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.)
3. Add env vars: `SEND_KEY` (for your backend) and `VIEW_KEY` (for the page). Use long random strings, e.g. `openssl rand -hex 24`.
4. Redeploy.

## Use
- On your phone, open `https://<app>.vercel.app/?key=<VIEW_KEY>` and tap **Enable notifications**.
- From your backend:
  `curl -G "https://<app>.vercel.app/api/send" --data-urlencode "key=<SEND_KEY>" --data-urlencode "msg=Build finished"`

## Test
`npm test`

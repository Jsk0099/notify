# msg-notify

A backend calls a GET endpoint; the Node server pushes the message over SSE to every phone/browser that has the page open.
No database, no npm dependencies.

## Run locally
`SEND_KEY=s VIEW_KEY=v npm start` → open http://localhost:3000/?key=v

## Deploy (Render, free)
1. Push this folder to GitHub.
2. Render → New → Blueprint → pick the repo (uses `render.yaml`). It generates `SEND_KEY` and `VIEW_KEY`; copy them from the service's Environment tab.

Works the same on any host that runs `npm start` as a long-lived process (Koyeb, Railway, a VPS).
It does NOT work on Vercel/Netlify: serverless instances can't share open connections.

## Use
- Phone: open `https://<app>.onrender.com/?key=<VIEW_KEY>`, tap **Enable notifications**.
- Backend:
  `curl -G "https://<app>.onrender.com/api/send" --data-urlencode "key=<SEND_KEY>" --data-urlencode "msg=Build finished"`
  Response `{"ok":true,"id":...,"delivered":N}`, where N = pages connected right now.

## Free-tier note
Render's free tier sleeps after 15 min with no requests. An open page reconnects every 5 min, which keeps the server awake.
When it is asleep, the first `/api/send` takes ~1 min to wake it, so give your backend call a 90s timeout.

## Test
`npm test`

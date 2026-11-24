# msg-notify

A backend calls a GET endpoint; the Node server pushes the message over SSE to every phone/browser that has the page open.
Phones also get a **Web Push** notification, so messages arrive as a banner even when the app and Chrome are closed.
One dependency (`web-push`, for push encryption), no database.

How background delivery works: no web page or service worker can keep running in the background (browsers stop a
service worker ~30 s after its last event). Instead, the server sends each message to the phone's push service
(Google FCM / Apple / Mozilla), which wakes the phone and `sw.js` just long enough to show the notification.

## Push keys (once)
`npx web-push generate-vapid-keys` → set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on the server.
Keep them fixed: new keys silently break every existing phone subscription. Without them, push is off and only the open page notifies.

## Run locally
`SEND_KEY=s VIEW_KEY=v VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... npm start` → open http://localhost:3000/?key=v
(Push needs HTTPS or localhost.)

## Deploy (Render, free)
1. Push this folder to GitHub.
2. Render → New → Blueprint → pick the repo (uses `render.yaml`). It generates `SEND_KEY` and `VIEW_KEY`; copy them from the service's Environment tab.
   It asks for `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: paste the keys from the step above.

Works the same on any host that runs `npm start` as a long-lived process (Koyeb, Railway, a VPS).
It does NOT work on Vercel/Netlify: serverless instances can't share open connections.

## Use
- Phone: open `https://<app>.onrender.com/?key=<VIEW_KEY>`, tap **Enable notifications**, then install it:
  - Android Chrome: menu ⋮ → **Install app** (or *Add to Home screen*). Open it once from the home screen.
  - iPhone (iOS 16.4+): Share → **Add to Home Screen**, open it from there, tap **Enable notifications**. iOS only allows push for home-screen apps.
- So Android shows it as a banner and doesn't delay it:
  - Settings → Apps → Messages (or Chrome) → Notifications → the site's category → turn on **Pop on screen** / set to **Urgent**.
  - Settings → Apps → Chrome → Battery → **Unrestricted**. Some phones (Xiaomi, Oppo, Vivo, Huawei, OnePlus) also need Chrome's *Autostart* allowed, or they kill push delivery.
  - Don't swipe-kill Chrome from recents on those phones; on stock Android/Pixel/Samsung it doesn't matter.
- Backend:
  `curl -G "https://<app>.onrender.com/api/send" --data-urlencode "key=<SEND_KEY>" --data-urlencode "msg=Build finished"`
  Response `{"ok":true,"id":...,"delivered":N,"pushed":P}`: N = pages open right now, P = phones the push was sent to.

## Free-tier note
Render's free tier sleeps after 15 min with no requests. An open page reconnects every 5 min, which keeps the server awake.
When it is asleep, the first `/api/send` takes ~1 min to wake it, so give your backend call a 90s timeout.

Phone subscriptions are saved to `subscriptions.json`, but Render's free disk is wiped when the service sleeps or redeploys.
Each phone re-registers whenever the app is opened, so after a wipe, pushes stop until each phone opens the app once.
To avoid that, keep the service awake: a free pinger (e.g. cron-job.org) calling `https://<app>.onrender.com/` every 10 min,
or use a host with a persistent disk (a VPS, Render paid + disk with `SUBS_FILE=/data/subscriptions.json`).

## Test
`npm test`

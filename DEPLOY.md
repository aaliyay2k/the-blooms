# Deploy The Blooms (live website)

Your app is ready to go live. The backend serves both the website and API.

## Option A — Render (recommended, free)

1. Push this project to GitHub (or deploy from the Render dashboard)
2. Go to [https://dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
3. Connect the repo
4. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add **Environment Variables** (from your local `backend/.env`):
   - `MONGODB_URI`
   - `MONGODB_URI_STANDARD` (optional fallback)
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` = `mailto:theblooms@example.com`
   - `CRON_SECRET` = any secret string
6. Deploy — you’ll get a URL like `https://the-blooms.onrender.com`

### Links after deploy
- **Him:** `https://YOUR-APP.onrender.com/`
- **You:** `https://YOUR-APP.onrender.com/the-blooms.html`

### Notifications (important on free Render)
Free Render **sleeps**, so in-app cron alone is unreliable. This app also **catch-up sends** due alerts whenever `/api/health` is hit (opening either link wakes the server).

Still recommended — free cron every 10 min to:
`https://YOUR-APP.onrender.com/api/health`

And at IST times, hit:
- `GET https://YOUR-APP.onrender.com/api/cron/notify?part=morning&secret=YOUR_CRON_SECRET` (10:00)
- `GET ...?part=night&secret=...` (23:00)
- `GET ...?part=her-reminder&secret=...` (12:00 and 19:00)

On phones: Add to Home Screen → open from icon → Allow → **Send test**.

Him: morning/night only fire if that day’s delivery is saved.
You: reminders only if notes remain on the cloud week plan.

## Option B — keep local for now
```bash
cd backend
npm run dev
```
Then open http://localhost:8787/

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

### Notifications
- He opens the site → enters code → allow notifications
- Server sends pushes at **10:00 AM** and **11:00 PM** India time
- Free Render may sleep; keep it awake with a free cron ping to `/api/health` every 10 minutes, or call:
  - `POST /api/cron/notify` with header `x-cron-secret: YOUR_SECRET` and body `{"part":"morning"}` or `{"part":"night"}`

## Option B — keep local for now
```bash
cd backend
npm run dev
```
Then open http://localhost:8787/

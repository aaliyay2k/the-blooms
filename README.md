# Morning Blooms

A two-way mini app for long-distance couples: every morning you can send each other a **digital bouquet**, a **written note**, and a **video**.

Works on **Android and iPhone** in the browser. He can open your link instantly — no Play Store needed. Both of you can also **Add to Home Screen** so it feels like a real app.

## How you two use it

1. **You** open the app, create your shared space, and note the couple code.
2. **Send him the website link** (after you deploy, or while testing).
3. He opens it on Android Chrome → optionally **Add to Home screen**.
4. Each morning, compose flowers + note + video, then **Share** the morning link (WhatsApp, Telegram, etc.).
5. When he taps the link, the morning **blooms** on his phone — bouquet → note → video.
6. He can send one back the same way.

### Video tip (important for long distance)

Paste an **unlisted YouTube** or **Google Drive** link so the video plays inside the app on his phone.  
Uploading a clip from your phone is great for preview, but that file stays on your device — so also share the video file in chat, or use a Drive/YouTube link.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL on your phone (same Wi‑Fi) or use your computer first.

## Put it online (so he can launch it anywhere)

Free and easy with [Vercel](https://vercel.com) or [Netlify](https://netlify.com):

```bash
npm run build
```

Then drag the `dist` folder into Netlify Drop, or deploy the repo to Vercel.  
Share the public URL with him — that is “sending the app.”

### Android: make it feel like an app

1. Open the link in **Chrome**
2. Tap the menu (⋮) → **Install app** or **Add to Home screen**
3. Launch from the icon every morning

### iPhone

1. Open in **Safari**
2. Share → **Add to Home Screen**

## Built with

Vite + React + TypeScript + Progressive Web App (PWA)

# The Blooms — Backend + durable database

Uses **MongoDB Atlas** (free cloud database) so bouquets, notes, and dates stay saved
even if the server restarts.

## 1) Create free MongoDB (about 5 minutes)

1. Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and sign up
2. Create a **free M0** cluster
3. **Database Access** → add a user (username + password)
4. **Network Access** → Add IP → **Allow Access from Anywhere** (`0.0.0.0/0`) for phone access
5. **Database** → Connect → **Drivers** → copy the connection string
6. Replace `<password>` in the string with your real password

## 2) Put the connection string in `.env`

In the `backend` folder:

```bash
copy .env.example .env
```

Edit `.env` and set:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/theblooms?retryWrites=true&w=majority
PORT=8787
```

## 3) Run

```bash
cd backend
npm install
npm run dev
```

Open:

- Him: http://localhost:8787/
- You: http://localhost:8787/the-blooms.html

Check health: http://localhost:8787/api/health  
You want `"db": "connected"`.

## Why MongoDB?

- Durable cloud storage (not wiped on restart)
- Free forever tier is enough for The Blooms
- Works when you deploy the site online later

import cors from "cors"
import dotenv from "dotenv"
import express from "express"
import path from "path"
import { fileURLToPath } from "url"
import { connectDb, getOrCreateCouple, isDbReady, sortDeliveries } from "./db.js"
import { notifyPart, pushEnabled, startNotificationScheduler } from "./notify.js"

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8787
const SITE_ROOT = path.join(__dirname, "..")
const CRON_SECRET = process.env.CRON_SECRET || ""

const app = express()
app.use(cors())
app.use(express.json({ limit: "2mb" }))

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

function requireDb(_req, res, next) {
  if (!isDbReady()) {
    return res.status(503).json({
      error: "Database is starting up. Try again in a moment.",
    })
  }
  next()
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "The Blooms",
    db: isDbReady() ? "connected" : "disconnected",
    push: pushEnabled,
    time: new Date().toISOString(),
  })
})

app.get("/api/push/public-key", (_req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: "Push not configured" })
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
})

app.post(
  "/api/couple/:code/push-subscribe",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await getOrCreateCouple(req.params.code)
    const subscription = req.body?.subscription
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: "Missing push subscription" })
    }

    const list = Array.isArray(couple.pushSubscriptions) ? [...couple.pushSubscriptions] : []
    const idx = list.findIndex((s) => s.endpoint === subscription.endpoint)
    if (idx >= 0) list[idx] = subscription
    else list.push(subscription)

    couple.pushSubscriptions = list
    couple.markModified("pushSubscriptions")
    await couple.save()

    res.json({ ok: true, devices: list.length })
  }),
)

/** External cron can hit this (Render free sleep workaround) */
app.post(
  "/api/cron/notify",
  asyncHandler(async (req, res) => {
    if (CRON_SECRET && req.get("x-cron-secret") !== CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" })
    }
    const part = req.body?.part || req.query?.part
    if (part !== "morning" && part !== "night") {
      return res.status(400).json({ error: 'part must be "morning" or "night"' })
    }
    const result = await notifyPart(part)
    res.json(result)
  }),
)

app.post(
  "/api/couple",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await getOrCreateCouple(req.body?.code)
    if (req.body?.herName) couple.herName = String(req.body.herName).trim()
    if (req.body?.hisName) couple.hisName = String(req.body.hisName).trim()
    await couple.save()

    res.json({
      code: couple.code,
      herName: couple.herName,
      hisName: couple.hisName,
      deliveryCount: couple.deliveries.length,
    })
  }),
)

app.get(
  "/api/couple/:code",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await getOrCreateCouple(req.params.code)
    res.json({
      code: couple.code,
      herName: couple.herName,
      hisName: couple.hisName,
      deliveryCount: couple.deliveries.length,
    })
  }),
)

app.put(
  "/api/couple/:code/week",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await getOrCreateCouple(req.params.code)
    const week = Array.isArray(req.body?.week) ? req.body.week : []
    couple.week = week

    const incoming = Array.isArray(req.body?.deliveries) ? req.body.deliveries : []
    const map = new Map(couple.deliveries.map((d) => [d.id, d]))
    for (const item of incoming) {
      if (!item?.id) continue
      map.set(item.id, { ...(map.get(item.id) || {}), ...item })
    }
    couple.deliveries = sortDeliveries([...map.values()])
    couple.markModified("week")
    couple.markModified("deliveries")
    await couple.save()

    res.json({
      ok: true,
      code: couple.code,
      weekReady: week.filter((s) => s.done).length,
      deliveryCount: couple.deliveries.length,
    })
  }),
)

app.put(
  "/api/couple/:code/deliveries/:id",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await getOrCreateCouple(req.params.code)
    const delivery = { ...req.body, id: req.params.id }
    const idx = couple.deliveries.findIndex((d) => d.id === delivery.id)
    if (idx >= 0) couple.deliveries[idx] = { ...couple.deliveries[idx], ...delivery }
    else couple.deliveries.push(delivery)

    couple.deliveries = sortDeliveries(couple.deliveries)
    couple.markModified("deliveries")
    await couple.save()

    res.json({ ok: true, delivery })
  }),
)

app.get(
  "/api/couple/:code/inbox",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await getOrCreateCouple(req.params.code)
    res.json({
      code: couple.code,
      herName: couple.herName,
      hisName: couple.hisName,
      deliveries: sortDeliveries(couple.deliveries),
    })
  }),
)

app.get(
  "/api/couple/:code/today",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await getOrCreateCouple(req.params.code)
    const today = req.query.date || new Date().toISOString().slice(0, 10)
    const list = couple.deliveries || []
    const morning = list.find((d) => d.dateKey === today && d.part === "morning") || null
    const night = list.find((d) => d.dateKey === today && d.part === "night") || null
    res.json({ date: today, morning, night })
  }),
)

app.use(express.static(SITE_ROOT))
app.get("/", (_req, res) => {
  res.sendFile(path.join(SITE_ROOT, "index.html"))
})

app.use((err, _req, res, _next) => {
  console.error("API error:", err.message)
  const status = err.status || 500
  res.status(status).json({
    error: err.message || "Something went wrong. Please try again.",
  })
})

async function start() {
  try {
    await connectDb()
  } catch (err) {
    console.error("MongoDB connection failed:", err.message)
    if (/whitelist|IP/i.test(err.message)) {
      console.error(
        "Fix: Atlas → Network Access → Add IP → Allow Access from Anywhere (0.0.0.0/0)",
      )
    } else {
      console.error("Check backend/.env MONGODB_URI from MongoDB Atlas.")
    }
  }

  app.listen(PORT, () => {
    console.log(`The Blooms running on http://localhost:${PORT}`)
    console.log(`His side:     http://localhost:${PORT}/`)
    console.log(`Your side:    http://localhost:${PORT}/the-blooms.html`)
    console.log(`Database:     ${isDbReady() ? "MongoDB connected" : "NOT connected — add MONGODB_URI"}`)
    console.log(`Push:         ${pushEnabled ? "enabled (10 AM & 11 PM IST)" : "disabled"}`)
    startNotificationScheduler()
  })
}

start()

// Do not crash the whole process on unexpected promise issues
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err)
})

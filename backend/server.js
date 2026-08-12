import cors from "cors"
import dotenv from "dotenv"
import express from "express"
import path from "path"
import { fileURLToPath } from "url"
import { connectDb, findCouple, getOrCreateCouple, isDbReady, sortDeliveries } from "./db.js"
import { notifyPart, notifyHerWriteReminders, pushEnabled, startNotificationScheduler } from "./notify.js"

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
    const couple = await findCouple(req.params.code)
    const subscription = req.body?.subscription
    const role = String(req.body?.role || "him").toLowerCase() === "her" ? "her" : "him"
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: "Missing push subscription" })
    }

    const field = role === "her" ? "herPushSubscriptions" : "pushSubscriptions"
    const list = Array.isArray(couple[field]) ? [...couple[field]] : []
    const idx = list.findIndex((s) => s.endpoint === subscription.endpoint)
    if (idx >= 0) list[idx] = subscription
    else list.push(subscription)

    couple[field] = list
    couple.markModified(field)
    await couple.save()

    res.json({ ok: true, role, devices: list.length })
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
    if (part === "her-reminder") {
      const result = await notifyHerWriteReminders()
      return res.json(result)
    }
    if (part !== "morning" && part !== "night") {
      return res.status(400).json({
        error: 'part must be "morning", "night", or "her-reminder"',
      })
    }
    const result = await notifyPart(part)
    res.json(result)
  }),
)

app.post(
  "/api/couple",
  requireDb,
  asyncHandler(async (req, res) => {
    const role = String(req.body?.role || "her").toLowerCase()
    const couple =
      role === "him" ? await findCouple(req.body?.code) : await getOrCreateCouple(req.body?.code)

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
    const couple = await findCouple(req.params.code)
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
    const couple = await findCouple(req.params.code)
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
    const couple = await findCouple(req.params.code)
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
    const couple = await findCouple(req.params.code)
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
    const couple = await findCouple(req.params.code)
    const today = req.query.date || new Date().toISOString().slice(0, 10)
    const list = couple.deliveries || []
    const morning = list.find((d) => d.dateKey === today && d.part === "morning") || null
    const night = list.find((d) => d.dateKey === today && d.part === "night") || null
    res.json({ date: today, morning, night })
  }),
)

function normalizeActivity(raw) {
  const activity = raw && typeof raw === "object" ? raw : {}
  return {
    appOpens: Number(activity.appOpens) || 0,
    lastOpenAt: activity.lastOpenAt || null,
    reads:
      activity.reads && typeof activity.reads === "object" && !Array.isArray(activity.reads)
        ? activity.reads
        : {},
  }
}

app.post(
  "/api/couple/:code/activity",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const type = String(req.body?.type || "").toLowerCase()
    const activity = normalizeActivity(couple.activity)
    const now = new Date().toISOString()

    if (type === "open") {
      activity.appOpens += 1
      activity.lastOpenAt = now
    } else if (type === "read") {
      const deliveryId = String(req.body?.deliveryId || "").trim()
      if (!deliveryId) {
        return res.status(400).json({ error: "deliveryId required for read" })
      }
      const prev = activity.reads[deliveryId] || { count: 0, lastReadAt: null }
      activity.reads[deliveryId] = {
        count: (Number(prev.count) || 0) + 1,
        lastReadAt: now,
        dateKey: req.body?.dateKey || prev.dateKey || "",
        part: req.body?.part || prev.part || "",
        dateLabel: req.body?.dateLabel || prev.dateLabel || "",
        whenLabel: req.body?.whenLabel || prev.whenLabel || "",
      }
    } else {
      return res.status(400).json({ error: 'type must be "open" or "read"' })
    }

    couple.activity = activity
    couple.markModified("activity")
    await couple.save()
    res.json({ ok: true, activity })
  }),
)

app.get(
  "/api/couple/:code/activity",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const activity = normalizeActivity(couple.activity)
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())

    const readEntries = Object.entries(activity.reads).map(([id, info]) => ({
      id,
      count: Number(info?.count) || 0,
      lastReadAt: info?.lastReadAt || null,
      dateKey: info?.dateKey || "",
      part: info?.part || "",
      dateLabel: info?.dateLabel || "",
      whenLabel: info?.whenLabel || "",
    }))

    const currentReads = readEntries.filter((r) => r.dateKey === today)
    const pastReads = readEntries.filter((r) => r.dateKey && r.dateKey !== today)
    const totalReads = readEntries.reduce((sum, r) => sum + r.count, 0)
    const pastReadCount = pastReads.reduce((sum, r) => sum + r.count, 0)
    const currentReadCount = currentReads.reduce((sum, r) => sum + r.count, 0)

    res.json({
      code: couple.code,
      today,
      appOpens: activity.appOpens,
      lastOpenAt: activity.lastOpenAt,
      totalReads,
      pastReadCount,
      currentReadCount,
      currentReads,
      pastReads,
      reads: activity.reads,
    })
  }),
)

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path === "/sw.js") {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate")
    res.set("Pragma", "no-cache")
  }
  next()
})
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
    console.log(`Push:         ${pushEnabled ? "enabled (him 10/23, her 12/19 IST)" : "disabled"}`)
    startNotificationScheduler()
  })
}

start()

// Do not crash the whole process on unexpected promise issues
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err)
})

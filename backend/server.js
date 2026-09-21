// Redeploy bump share-invite
import cors from "cors"
import dotenv from "dotenv"
import express from "express"
import path from "path"
import { fileURLToPath } from "url"
import { connectDb, findCouple, getOrCreateCouple, isDbReady, sortDeliveries } from "./db.js"
import {
  catchUpDueNotifications,
  getVapidPublicKey,
  normalizeSubscription,
  notifyHerWriteReminders,
  notifyPart,
  pushEnabled,
  sendTestPush,
  startNotificationScheduler,
} from "./notify.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, ".env") })

const PORT = process.env.PORT || 8787
const SITE_ROOT = path.join(__dirname, "..")
const CRON_SECRET = process.env.CRON_SECRET || ""

const app = express()
app.use(cors())
app.use(express.json({ limit: "20mb" }))

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

function requireDb(_req, res, next) {
  if (!isDbReady()) {
    return res.status(503).json({ error: "Database is starting up. Try again in a moment." })
  }
  next()
}

function upsertDelivery(list, delivery) {
  const next = Array.isArray(list) ? [...list] : []
  const id = delivery.id || `${delivery.dateKey}-${delivery.part}`
  delivery.id = id
  const idx = next.findIndex((d) => d.id === id)
  if (idx >= 0) next[idx] = { ...next[idx], ...delivery }
  else next.push(delivery)
  return sortDeliveries(next)
}

function authorizeCron(req) {
  if (!CRON_SECRET) return true
  const secret = req.get("x-cron-secret") || req.query.secret
  return secret === CRON_SECRET
}

function indiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

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

/** Health — fast response; catch-up runs in background so Render free tier stays healthy */
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "The Blooms",
    db: isDbReady() ? "connected" : "disconnected",
    push: pushEnabled,
    time: new Date().toISOString(),
  })

  if (isDbReady() && pushEnabled) {
    catchUpDueNotifications().catch((err) => {
      console.error("Catch-up notify failed:", err.message)
    })
  }
})

app.get("/api/push/public-key", (_req, res) => {
  const publicKey = getVapidPublicKey()
  if (!publicKey) return res.status(503).json({ error: "Push not configured" })
  res.json({ publicKey })
})

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
      deliveryCount: (couple.deliveries || []).length,
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
      week: couple.week || [],
      deliveries: sortDeliveries(couple.deliveries || []),
      deliveryCount: (couple.deliveries || []).length,
    })
  }),
)

app.get(
  "/api/couple/:code/week",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    res.json({
      code: couple.code,
      week: Array.isArray(couple.week) ? couple.week : [],
      deliveries: sortDeliveries(couple.deliveries || []),
    })
  }),
)

app.put(
  "/api/couple/:code/week",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const week = Array.isArray(req.body?.week) ? req.body.week : []
    const deliveries = Array.isArray(req.body?.deliveries) ? req.body.deliveries : []

    couple.week = week
    couple.markModified("week")

    let list = Array.isArray(couple.deliveries) ? [...couple.deliveries] : []
    for (const d of deliveries) {
      if (!d) continue
      list = upsertDelivery(list, d)
    }
    couple.deliveries = list
    couple.markModified("deliveries")
    await couple.save()

    res.json({
      ok: true,
      code: couple.code,
      weekReady: week.filter((s) => s.done).length,
      weekCount: week.length,
      deliveryCount: list.length,
    })
  }),
)

app.put(
  "/api/couple/:code/deliveries/:id",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const delivery = { ...(req.body || {}), id: req.params.id }
    couple.deliveries = upsertDelivery(couple.deliveries, delivery)
    couple.markModified("deliveries")
    await couple.save()
    res.json({ ok: true, id: delivery.id, delivery })
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
      deliveries: sortDeliveries(couple.deliveries || []),
    })
  }),
)

app.get(
  "/api/couple/:code/today",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const today = req.query.date || indiaToday()
    const list = sortDeliveries(couple.deliveries || [])
    const morning = list.find((d) => d.dateKey === today && d.part === "morning") || null
    const night = list.find((d) => d.dateKey === today && d.part === "night") || null
    res.json({ date: today, morning, night, deliveries: list })
  }),
)

app.post(
  "/api/couple/:code/push-subscribe",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const role = String(req.body?.role || "him").toLowerCase() === "her" ? "her" : "him"
    const normalized = normalizeSubscription(req.body?.subscription)
    if (!normalized) {
      return res.status(400).json({
        error: "Invalid push subscription. Allow notifications again from the Home Screen app.",
      })
    }

    const field = role === "her" ? "herPushSubscriptions" : "pushSubscriptions"
    const list = Array.isArray(couple[field]) ? [...couple[field]] : []
    const clean = list.map(normalizeSubscription).filter(Boolean)
    const idx = clean.findIndex((s) => s.endpoint === normalized.endpoint)
    if (idx >= 0) clean[idx] = normalized
    else clean.push(normalized)

    couple[field] = clean
    couple.markModified(field)
    await couple.save()
    res.json({ ok: true, role, devices: clean.length })
  }),
)

app.post(
  "/api/couple/:code/push-test",
  requireDb,
  asyncHandler(async (req, res) => {
    const role = String(req.body?.role || "him").toLowerCase() === "her" ? "her" : "him"
    const result = await sendTestPush(req.params.code, role)
    res.json(result)
  }),
)

/** How many phones are linked for push — used so her side can see if his alerts are on */
app.get(
  "/api/couple/:code/push-status",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const himDevices = (Array.isArray(couple.pushSubscriptions) ? couple.pushSubscriptions : [])
      .map(normalizeSubscription)
      .filter(Boolean).length
    const herDevices = (Array.isArray(couple.herPushSubscriptions) ? couple.herPushSubscriptions : [])
      .map(normalizeSubscription)
      .filter(Boolean).length
    res.json({
      code: couple.code,
      himLinked: himDevices > 0,
      herLinked: herDevices > 0,
      himDevices,
      herDevices,
    })
  }),
)

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
      const prev = activity.reads[deliveryId] || { count: 0 }
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

/** Compatibility aliases used by some clients */
app.post(
  "/api/couple/:code/activity/open",
  requireDb,
  asyncHandler(async (req, res) => {
    req.body = { ...(req.body || {}), type: "open" }
    const couple = await findCouple(req.params.code)
    const activity = normalizeActivity(couple.activity)
    activity.appOpens += 1
    activity.lastOpenAt = new Date().toISOString()
    couple.activity = activity
    couple.markModified("activity")
    await couple.save()
    res.json({ ok: true, appOpens: activity.appOpens })
  }),
)

app.post(
  "/api/couple/:code/activity/read",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const deliveryId = String(req.body?.deliveryId || req.body?.id || "").trim()
    if (!deliveryId) return res.status(400).json({ error: "Missing deliveryId" })
    const activity = normalizeActivity(couple.activity)
    const prev = activity.reads[deliveryId] || { count: 0 }
    activity.reads[deliveryId] = {
      count: (Number(prev.count) || 0) + 1,
      lastReadAt: new Date().toISOString(),
      dateKey: req.body?.dateKey || prev.dateKey || "",
      part: req.body?.part || prev.part || "",
      dateLabel: req.body?.dateLabel || prev.dateLabel || "",
      whenLabel: req.body?.whenLabel || prev.whenLabel || "",
    }
    couple.activity = activity
    couple.markModified("activity")
    await couple.save()
    res.json({ ok: true, read: activity.reads[deliveryId] })
  }),
)

app.get(
  "/api/couple/:code/activity",
  requireDb,
  asyncHandler(async (req, res) => {
    const couple = await findCouple(req.params.code)
    const activity = normalizeActivity(couple.activity)
    const today = indiaToday()

    const readEntries = Object.entries(activity.reads).map(([id, info]) => ({
      id,
      count: Number(info?.count) || 0,
      lastReadAt: info?.lastReadAt || null,
      dateKey: info?.dateKey || "",
      part: info?.part || "",
      dateLabel: info?.dateLabel || "",
      whenLabel:
        info?.whenLabel ||
        (info?.part === "night" ? "Night" : info?.part === "morning" ? "Morning" : ""),
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

app.post(
  "/api/cron/notify",
  asyncHandler(async (req, res) => {
    if (!authorizeCron(req)) return res.status(401).json({ error: "Unauthorized" })
    const part = req.body?.part || req.query?.part
    if (part === "her-reminder") return res.json(await notifyHerWriteReminders())
    if (part !== "morning" && part !== "night") {
      return res.status(400).json({
        error: 'part must be "morning", "night", or "her-reminder"',
      })
    }
    res.json(await notifyPart(part))
  }),
)

app.get(
  "/api/cron/notify",
  asyncHandler(async (req, res) => {
    if (!authorizeCron(req)) return res.status(401).json({ error: "Unauthorized" })
    const part = req.query.part
    if (part === "her-reminder") return res.json(await notifyHerWriteReminders())
    if (part !== "morning" && part !== "night") {
      return res.status(400).json({
        error: 'part must be "morning", "night", or "her-reminder"',
      })
    }
    res.json(await notifyPart(part))
  }),
)

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path === "/sw.js" || req.path === "/manifest.webmanifest") {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate")
    res.set("Pragma", "no-cache")
  }
  next()
})

app.use(express.static(SITE_ROOT))

app.get("/", (_req, res) => {
  res.sendFile(path.join(SITE_ROOT, "index.html"), (err) => {
    if (err) {
      res
        .status(200)
        .type("html")
        .send(
          "<!doctype html><title>The Blooms</title><h1>The Blooms backend is running</h1><p><a href='/api/health'>/api/health</a></p>",
        )
    }
  })
})

app.use((err, _req, res, _next) => {
  console.error("API error:", err.message)
  res.status(err.status || 500).json({
    error: err.message || "Something went wrong. Please try again.",
  })
})

async function start() {
  try {
    await connectDb()
  } catch (err) {
    console.error("MongoDB connection failed:", err.message)
    if (/whitelist|IP/i.test(err.message)) {
      console.error("Fix: Atlas → Network Access → Allow Access from Anywhere (0.0.0.0/0)")
    } else {
      console.error("Check backend/.env MONGODB_URI")
    }
  }

  startNotificationScheduler()

  app.listen(PORT, () => {
    console.log(`The Blooms backend on http://localhost:${PORT}`)
    console.log(`Homepage:     http://localhost:${PORT}/`)
    console.log(`His side:     http://localhost:${PORT}/his-morning.html`)
    console.log(`Your side:    http://localhost:${PORT}/the-blooms.html`)
    console.log(`Health:       http://localhost:${PORT}/api/health`)
    console.log(`Database:     ${isDbReady() ? "connected" : "NOT connected"}`)
    console.log(`Push:         ${pushEnabled ? "enabled" : "disabled (set VAPID keys)"}`)
  })
}

start()

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err)
})

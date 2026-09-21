import cron from "node-cron"
import webpush from "web-push"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"
import { Couple, findCouple, isDbReady, sortDeliveries } from "./db.js"

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") })

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key]
    if (value && String(value).trim()) return String(value).trim()
  }
  return ""
}

function configureWebPush() {
  const publicKey = env("VAPID_PUBLIC_KEY")
  const privateKey = env("VAPID_PRIVATE_KEY")
  const subject = env("VAPID_SUBJECT") || "mailto:theblooms@example.com"
  if (!publicKey || !privateKey) {
    console.warn("VAPID keys missing — push disabled until env is set.")
    return false
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    console.log("Web push configured")
    return true
  } catch (err) {
    console.error("VAPID setup failed:", err.message)
    return false
  }
}

export const pushEnabled = configureWebPush()

export function getVapidPublicKey() {
  return env("VAPID_PUBLIC_KEY")
}

function todayKeyInIndia(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function indiaMinutesNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0)
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0)
  return hour * 60 + minute
}

export function normalizeSubscription(raw) {
  if (!raw || typeof raw !== "object") return null
  const endpoint = raw.endpoint
  const keys = raw.keys || {}
  const p256dh = keys.p256dh || keys.p256DH
  const auth = keys.auth
  if (!endpoint || !p256dh || !auth) return null
  return {
    endpoint: String(endpoint),
    expirationTime: raw.expirationTime ?? null,
    keys: {
      p256dh: String(p256dh),
      auth: String(auth),
    },
  }
}

function collectSubscriptions(couple, role) {
  const bags = []
  if (role === "her") {
    bags.push(couple.herPushSubscriptions)
    try {
      const obj = couple.toObject ? couple.toObject() : couple
      for (const [key, value] of Object.entries(obj || {})) {
        if (/her/i.test(key) && /push/i.test(key) && Array.isArray(value)) bags.push(value)
      }
    } catch (_) {}
  } else {
    bags.push(couple.pushSubscriptions)
  }

  const byEndpoint = new Map()
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue
    for (const item of bag) {
      const n = normalizeSubscription(item)
      if (n) byEndpoint.set(n.endpoint, n)
    }
  }
  return [...byEndpoint.values()]
}

function alreadySent(couple, key) {
  const log = couple.notifySent && typeof couple.notifySent === "object" ? couple.notifySent : {}
  return Boolean(log[key])
}

async function markSent(couple, key) {
  if (!couple.notifySent || typeof couple.notifySent !== "object") couple.notifySent = {}
  couple.notifySent[key] = new Date().toISOString()
  couple.markModified("notifySent")
  await couple.save()
}

async function saveRoleSubscriptions(couple, role, list) {
  if (role === "her") {
    couple.herPushSubscriptions = list
    couple.markModified("herPushSubscriptions")
  } else {
    couple.pushSubscriptions = list
    couple.markModified("pushSubscriptions")
  }
  await couple.save()
}

async function sendToRole(couple, role, payload) {
  if (!pushEnabled) return { sent: 0, removed: 0, errors: ["push-disabled"] }
  const list = collectSubscriptions(couple, role)
  if (!list.length) return { sent: 0, removed: 0, errors: ["no-subscriptions"] }

  const body = JSON.stringify({
    title: payload.title || "The Blooms",
    body: payload.body || "",
    url: payload.url || "/",
    part: payload.part || "",
  })

  const keep = []
  const errors = []
  let sent = 0
  let removed = 0

  for (const sub of list) {
    try {
      await webpush.sendNotification(sub, body, {
        TTL: 60 * 60 * 24,
        urgency: "high",
      })
      keep.push(sub)
      sent += 1
    } catch (err) {
      const code = err?.statusCode
      const msg = err?.body || err?.message || String(err)
      console.error(`Push failed (${role}) status=${code}:`, msg)
      if (code === 404 || code === 410 || code === 401 || code === 403) {
        removed += 1
        if (code === 401 || code === 403) errors.push("vapid-or-auth-failed")
      } else {
        keep.push(sub)
        errors.push(String(msg))
      }
    }
  }

  await saveRoleSubscriptions(couple, role, keep)
  return { sent, removed, errors, devices: list.length }
}

export async function notifyPart(part, { force = false } = {}) {
  if (!isDbReady()) return { ok: false, reason: "db" }

  const dateKey = todayKeyInIndia()
  const sentKey = `${dateKey}-${part}`
  const couples = await Couple.find({})
  let totalSent = 0
  let couplesNotified = 0
  let skipped = 0
  let noDelivery = 0

  for (const couple of couples) {
    if (!force && alreadySent(couple, sentKey)) {
      skipped += 1
      continue
    }

    const delivery = sortDeliveries(couple.deliveries || []).find(
      (d) => d.dateKey === dateKey && d.part === part,
    )
    if (!delivery) {
      noDelivery += 1
      continue
    }

    const title = part === "morning" ? "Good morning 🌸" : "Good night 🌙"
    const body =
      part === "morning"
        ? "Your morning bouquet and note are waiting in The Blooms."
        : "Your night bouquet and note are waiting in The Blooms."

    const result = await sendToRole(couple, "him", {
      title,
      body,
      url: "/his-morning.html",
      part,
      dateKey,
    })
    totalSent += result.sent
    if (result.sent > 0) {
      couplesNotified += 1
      await markSent(couple, sentKey)
    }
  }

  console.log(
    `Notify ${part} ${dateKey}: ${couplesNotified} couples, ${totalSent} pushes, skipped=${skipped}, noDelivery=${noDelivery}`,
  )
  return { ok: true, dateKey, part, couplesNotified, totalSent, skipped, noDelivery }
}

export async function notifyHerWriteReminders(windowKey = null, { force = false } = {}) {
  if (!isDbReady()) return { ok: false, reason: "db" }

  const dateKey = todayKeyInIndia()
  const mins = indiaMinutesNow()
  const key =
    windowKey ||
    (mins >= 19 * 60 ? `${dateKey}-her-19` : mins >= 12 * 60 ? `${dateKey}-her-12` : null)
  if (!key) return { ok: true, skipped: true, reason: "too-early" }

  const couples = await Couple.find({})
  let totalSent = 0
  let couplesNotified = 0
  let skipped = 0

  for (const couple of couples) {
    if (!force && alreadySent(couple, key)) {
      skipped += 1
      continue
    }

    const week = Array.isArray(couple.week) ? couple.week : []
    if (!week.length) continue
    const remaining = week.filter((s) => !s.done).length
    if (remaining <= 0) continue

    const title =
      remaining === 1 ? "1 note remaining to write" : `${remaining} notes remaining to write`
    const result = await sendToRole(couple, "her", {
      title,
      body: "Open The Blooms and finish today’s empty slots for him.",
      url: "/the-blooms.html",
      part: "her-reminder",
    })
    totalSent += result.sent
    if (result.sent > 0) {
      couplesNotified += 1
      await markSent(couple, key)
    }
  }

  console.log(`Her reminders ${key}: ${couplesNotified} couples, ${totalSent} pushes`)
  return { ok: true, part: "her-reminder", key, couplesNotified, totalSent, skipped }
}

export function startNotificationScheduler() {
  if (!pushEnabled) {
    console.warn("Push scheduler not started — VAPID keys missing")
    return
  }

  cron.schedule("0 10 * * *", () => notifyPart("morning").catch(console.error), {
    timezone: "Asia/Kolkata",
  })
  cron.schedule("0 23 * * *", () => notifyPart("night").catch(console.error), {
    timezone: "Asia/Kolkata",
  })
  cron.schedule(
    "0 12 * * *",
    () => notifyHerWriteReminders(`${todayKeyInIndia()}-her-12`).catch(console.error),
    { timezone: "Asia/Kolkata" },
  )
  cron.schedule(
    "0 19 * * *",
    () => notifyHerWriteReminders(`${todayKeyInIndia()}-her-19`).catch(console.error),
    { timezone: "Asia/Kolkata" },
  )

  console.log("Schedule: him 10:00 & 23:00; her 12:00 & 19:00 Asia/Kolkata")
}

/** Send anything already due (used after Render wakes). */
export async function catchUpDueNotifications() {
  if (!pushEnabled || !isDbReady()) return { ok: false, reason: "unavailable" }
  const mins = indiaMinutesNow()
  const dateKey = todayKeyInIndia()
  const results = {}
  if (mins >= 10 * 60) results.morning = await notifyPart("morning")
  if (mins >= 23 * 60) results.night = await notifyPart("night")
  if (mins >= 12 * 60 && mins < 19 * 60) {
    results.her = await notifyHerWriteReminders(`${dateKey}-her-12`)
  }
  if (mins >= 19 * 60) results.her = await notifyHerWriteReminders(`${dateKey}-her-19`)
  return { ok: true, dateKey, mins, results }
}

export async function sendTestPush(code, role = "him") {
  if (!isDbReady()) throw Object.assign(new Error("Database not ready"), { status: 503 })
  if (!pushEnabled) throw Object.assign(new Error("Push not configured on server"), { status: 503 })

  const couple = await findCouple(code)
  const who = role === "her" ? "her" : "him"
  const result = await sendToRole(couple, who, {
    title: "The Blooms — test",
    body:
      who === "her"
        ? "Reminders work! Keep the app on your Home Screen."
        : "Alerts work! Keep The Blooms on your Home Screen.",
    url: who === "her" ? "/the-blooms.html" : "/his-morning.html",
    part: "test",
  })

  if (result.sent === 0) {
    const hint = result.errors?.includes("vapid-or-auth-failed")
      ? "Old notification link expired. Tap Allow notifications again on the phone."
      : who === "him"
        ? "No phone linked. iPhone: Safari → Share → Add to Home Screen → open icon → Allow. Android: Chrome → Allow."
        : "No phone linked. iPhone: Add to Home Screen first, then Allow reminders."
    throw Object.assign(new Error(hint), { status: 400, details: result })
  }

  return { ok: true, role: who, ...result }
}

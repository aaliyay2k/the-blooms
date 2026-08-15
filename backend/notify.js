import cron from "node-cron"
import webpush from "web-push"
import { Couple, findCouple, isDbReady, sortDeliveries } from "./db.js"

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || "mailto:theblooms@example.com"
  if (!publicKey || !privateKey) {
    console.warn("VAPID keys missing — push notifications disabled until .env is set.")
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

export const pushEnabled = configureWebPush()

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

function subscriptionsForRole(couple, role) {
  if (role === "her") {
    return Array.isArray(couple.herPushSubscriptions) ? couple.herPushSubscriptions : []
  }
  return Array.isArray(couple.pushSubscriptions) ? couple.pushSubscriptions : []
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

async function sendToRole(couple, role, payload) {
  if (!pushEnabled) return { sent: 0, removed: 0 }
  const list = subscriptionsForRole(couple, role)
  if (!list.length) return { sent: 0, removed: 0 }

  const body = JSON.stringify(payload)
  const keep = []
  let sent = 0
  let removed = 0

  for (const sub of list) {
    try {
      await webpush.sendNotification(sub, body)
      keep.push(sub)
      sent += 1
    } catch (err) {
      const code = err?.statusCode
      if (code === 404 || code === 410) {
        removed += 1
      } else {
        keep.push(sub)
        console.error("Push failed:", err.message)
      }
    }
  }

  const field = role === "her" ? "herPushSubscriptions" : "pushSubscriptions"
  if (removed > 0 || keep.length !== list.length) {
    couple[field] = keep
    couple.markModified(field)
    await couple.save()
  }

  return { sent, removed }
}

export async function notifyPart(part, { force = false } = {}) {
  if (!isDbReady()) {
    console.warn("Skip notify — database not ready")
    return { ok: false, reason: "db" }
  }

  const dateKey = todayKeyInIndia()
  const sentKey = `${dateKey}-${part}`
  const couples = await Couple.find({})
  let totalSent = 0
  let couplesNotified = 0
  let skipped = 0

  for (const couple of couples) {
    if (!force && alreadySent(couple, sentKey)) {
      skipped += 1
      continue
    }

    const delivery = sortDeliveries(couple.deliveries || []).find(
      (d) => d.dateKey === dateKey && d.part === part,
    )
    if (!delivery) continue

    const title = part === "morning" ? "Good morning 🌸" : "Good night 🌙"
    const body =
      part === "morning"
        ? "Your morning bouquet and note are waiting in The Blooms."
        : "Your night bouquet and note are waiting in The Blooms."

    const result = await sendToRole(couple, "him", {
      title,
      body,
      url: "/",
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
    `Notify ${part} ${dateKey}: ${couplesNotified} couples, ${totalSent} pushes, ${skipped} already sent`,
  )
  return { ok: true, dateKey, part, couplesNotified, totalSent, skipped }
}

/** Her phone: remaining notes reminder at 12:00 and 19:00 IST */
export async function notifyHerWriteReminders(windowKey = null, { force = false } = {}) {
  if (!isDbReady()) {
    console.warn("Skip her reminder — database not ready")
    return { ok: false, reason: "db" }
  }

  const dateKey = todayKeyInIndia()
  const mins = indiaMinutesNow()
  // Auto-pick window if not specified: after 19:00 use her-19, else her-12
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
    const body = "Open The Blooms and finish today’s empty slots for him."

    const result = await sendToRole(couple, "her", {
      title,
      body,
      url: "/the-blooms.html",
      part: "her-reminder",
    })
    totalSent += result.sent
    if (result.sent > 0) {
      couplesNotified += 1
      await markSent(couple, key)
    }
  }

  console.log(`Her write reminders ${key}: ${couplesNotified} couples, ${totalSent} pushes, ${skipped} already sent`)
  return { ok: true, part: "her-reminder", key, couplesNotified, totalSent, skipped }
}

export function startNotificationScheduler() {
  if (!pushEnabled) return

  cron.schedule(
    "0 10 * * *",
    () => {
      notifyPart("morning").catch((err) => console.error(err))
    },
    { timezone: "Asia/Kolkata" },
  )

  cron.schedule(
    "0 23 * * *",
    () => {
      notifyPart("night").catch((err) => console.error(err))
    },
    { timezone: "Asia/Kolkata" },
  )

  cron.schedule(
    "0 12 * * *",
    () => {
      notifyHerWriteReminders(`${todayKeyInIndia()}-her-12`).catch((err) => console.error(err))
    },
    { timezone: "Asia/Kolkata" },
  )

  cron.schedule(
    "0 19 * * *",
    () => {
      notifyHerWriteReminders(`${todayKeyInIndia()}-her-19`).catch((err) => console.error(err))
    },
    { timezone: "Asia/Kolkata" },
  )

  console.log(
    "Notification schedule ready: him 10:00 & 23:00; her reminders 12:00 & 19:00 Asia/Kolkata",
  )
}

/**
 * Render free tier sleeps — when anyone wakes the server, send anything that is already due.
 */
export async function catchUpDueNotifications() {
  if (!pushEnabled || !isDbReady()) return { ok: false, reason: "unavailable" }

  const mins = indiaMinutesNow()
  const dateKey = todayKeyInIndia()
  const results = {}

  if (mins >= 10 * 60) {
    results.morning = await notifyPart("morning")
  }
  if (mins >= 23 * 60) {
    results.night = await notifyPart("night")
  }
  if (mins >= 12 * 60 && mins < 19 * 60) {
    results.her = await notifyHerWriteReminders(`${dateKey}-her-12`)
  }
  if (mins >= 19 * 60) {
    results.her = await notifyHerWriteReminders(`${dateKey}-her-19`)
  }

  return { ok: true, dateKey, mins, results }
}

/** Immediate test push to one couple (him or her devices). */
export async function sendTestPush(code, role = "him") {
  if (!isDbReady()) throw Object.assign(new Error("Database not ready"), { status: 503 })
  if (!pushEnabled) throw Object.assign(new Error("Push not configured"), { status: 503 })

  const couple = await findCouple(code)

  const who = role === "her" ? "her" : "him"
  const result = await sendToRole(couple, who, {
    title: "The Blooms — test",
    body:
      who === "her"
        ? "Reminders are working. You’ll get a ping when notes are still left."
        : "Alerts are working. You’ll get morning (10:00) and night (11:00) pings.",
    url: who === "her" ? "/the-blooms.html" : "/",
    part: "test",
  })

  if (result.sent === 0) {
    throw Object.assign(
      new Error(
        who === "him"
          ? "No phone linked yet. On his phone: open from Home Screen, enter code, tap Allow notifications."
          : "No phone linked yet. On your phone: Add to Home Screen (iPhone), open from the icon, enter code, tap Allow reminders.",
      ),
      { status: 400 },
    )
  }

  return { ok: true, role: who, ...result }
}

import cron from "node-cron"
import webpush from "web-push"
import { Couple, isDbReady, sortDeliveries } from "./db.js"

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
  // Asia/Kolkata calendar date YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

async function sendToCouple(couple, payload) {
  if (!pushEnabled || !couple.pushSubscriptions?.length) return { sent: 0, removed: 0 }

  const body = JSON.stringify(payload)
  const keep = []
  let sent = 0
  let removed = 0

  for (const sub of couple.pushSubscriptions) {
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

  if (removed > 0 || keep.length !== couple.pushSubscriptions.length) {
    couple.pushSubscriptions = keep
    couple.markModified("pushSubscriptions")
    await couple.save()
  }

  return { sent, removed }
}

export async function notifyPart(part) {
  if (!isDbReady()) {
    console.warn("Skip notify — database not ready")
    return { ok: false, reason: "db" }
  }

  const dateKey = todayKeyInIndia()
  const couples = await Couple.find({})
  let totalSent = 0
  let couplesNotified = 0

  for (const couple of couples) {
    const delivery = sortDeliveries(couple.deliveries || []).find(
      (d) => d.dateKey === dateKey && d.part === part,
    )
    if (!delivery) continue

    const title =
      part === "morning" ? "Good morning 🌸" : "Good night 🌙"
    const body =
      part === "morning"
        ? "Your morning bouquet and note are waiting in The Blooms."
        : "Your night bouquet and note are waiting in The Blooms."

    const result = await sendToCouple(couple, {
      title,
      body,
      url: "/",
      part,
      dateKey,
    })
    totalSent += result.sent
    if (result.sent > 0) couplesNotified += 1
  }

  console.log(`Notify ${part} ${dateKey}: ${couplesNotified} couples, ${totalSent} pushes`)
  return { ok: true, dateKey, part, couplesNotified, totalSent }
}

export function startNotificationScheduler() {
  if (!pushEnabled) return

  // 10:00 AM India
  cron.schedule(
    "0 10 * * *",
    () => {
      notifyPart("morning").catch((err) => console.error(err))
    },
    { timezone: "Asia/Kolkata" },
  )

  // 11:00 PM India
  cron.schedule(
    "0 23 * * *",
    () => {
      notifyPart("night").catch((err) => console.error(err))
    },
    { timezone: "Asia/Kolkata" },
  )

  console.log("Notification schedule ready: 10:00 AM & 11:00 PM Asia/Kolkata")
}

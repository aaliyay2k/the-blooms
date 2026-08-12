/** Shared store: local cache + backend sync for The Blooms */
window.BloomsStore = (function () {
  const INBOX_KEY = "blooms:his-inbox"
  const OPENED_KEY = "blooms:opened"
  const WEEK_KEY = "blooms:her-week-v2"
  const COUPLE_KEY = "blooms:couple-code"
  const API_KEY = "blooms:api-url"

  // Local API while developing. Change later when you deploy.
  const DEFAULT_API = "http://localhost:8787"

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return fallback
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  }

  function pad(n) {
    return String(n).padStart(2, "0")
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  /** Calendar date in Asia/Kolkata (matches push schedule). */
  function dateKeyInIndia(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)
  }

  function addDaysToKey(key, days) {
    const [y, m, d] = String(key).split("-").map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + days)
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
  }

  function weekdayIndexMon0InIndia(date = new Date()) {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
    }).format(date)
    return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[wd] ?? 0
  }

  function getMondayKeyInIndia(from = new Date()) {
    return addDaysToKey(dateKeyInIndia(from), -weekdayIndexMon0InIndia(from))
  }

  function formatDateKey(key) {
    const [y, m, d] = String(key).split("-").map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d, 12))
    return dt.toLocaleDateString("en-IN", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })
  }

  function shortDateKey(key) {
    const [y, m, d] = String(key).split("-").map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d, 12))
    return dt.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
  }

  function formatDate(date) {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  function getMonday(from = new Date()) {
    const key = getMondayKeyInIndia(from)
    const [y, m, d] = key.split("-").map(Number)
    return new Date(y, m - 1, d)
  }

  function dateForWeekSlot(dayIndex, from = new Date()) {
    const monday = getMonday(from)
    const d = new Date(monday)
    d.setDate(monday.getDate() + dayIndex)
    return d
  }

  /** Attach calendar dates (IST week) to every planner slot.
   *  weekOffset: 0 = this week, 1 = next week, etc.
   */
  function stampWeekDates(week, options = {}) {
    const from = options.from instanceof Date ? options.from : new Date()
    const weekOffset = Number(options.weekOffset ?? 0)
    const mondayKey =
      options.mondayKey || addDaysToKey(getMondayKeyInIndia(from), weekOffset * 7)
    return (week || []).map((slot) => {
      const key = addDaysToKey(mondayKey, slot.dayIndex)
      const partLabel = slot.part === "morning" ? "Morning" : "Night"
      return {
        ...slot,
        weekStartKey: mondayKey,
        weekOffset,
        dateKey: key,
        dateLabel: formatDateKey(key),
        label: `${slot.day} · ${partLabel} · ${shortDateKey(key)}`,
      }
    })
  }

  function planningMondayKey(weekOffset = 1, from = new Date()) {
    return addDaysToKey(getMondayKeyInIndia(from), Number(weekOffset) * 7)
  }

  function getApiBase() {
    const saved = localStorage.getItem(API_KEY)
    if (saved) return saved.replace(/\/$/, "")
    if (typeof window !== "undefined") {
      const host = window.location.hostname
      // Same-origin when served by The Blooms backend (local or live)
      if (host !== "localhost" && host !== "127.0.0.1") return window.location.origin
      if (window.location.port === "8787") return window.location.origin
    }
    return DEFAULT_API
  }

  function setApiBase(url) {
    localStorage.setItem(API_KEY, url.replace(/\/$/, ""))
  }

  function getCoupleCode() {
    return (localStorage.getItem(COUPLE_KEY) || "").trim().toUpperCase()
  }

  function setCoupleCode(code) {
    const clean = String(code || "").trim().toUpperCase()
    if (!clean) {
      localStorage.removeItem(COUPLE_KEY)
      return
    }
    localStorage.setItem(COUPLE_KEY, clean)
  }

  async function api(path, options = {}) {
    const res = await fetch(`${getApiBase()}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    })
    if (!res.ok) {
      let message = "Request failed"
      try {
        const body = await res.json()
        message = body.error || message
      } catch (_) {}
      throw new Error(message)
    }
    return res.json()
  }

  function getInbox() {
    return read(INBOX_KEY, [])
  }

  function setInbox(list) {
    write(INBOX_KEY, list)
  }

  function upsertLocal(delivery) {
    const inbox = getInbox().filter((d) => d.id !== delivery.id)
    inbox.unshift(delivery)
    inbox.sort((a, b) => {
      if (a.dateKey === b.dateKey) return a.part === "night" ? -1 : 1
      return a.dateKey < b.dateKey ? 1 : -1
    })
    setInbox(inbox)
    return inbox
  }

  function deliveryFromSlot(slot) {
    if (!slot || !slot.done) return null
    const key = slot.dateKey || dateKey(dateForWeekSlot(slot.dayIndex))
    const dateLabel = slot.dateLabel || formatDateKey(key)
    return {
      id: `${key}-${slot.part}`,
      slotId: slot.id,
      dateKey: key,
      dateLabel,
      part: slot.part,
      whenLabel: slot.part === "morning" ? "Morning" : "Night",
      title:
        slot.part === "morning"
          ? "A bouquet for your morning."
          : "A bouquet for your night.",
      flowers: (slot.flowers || []).map((f) => ({ ...f })),
      kind: slot.kind,
      kindLabel: slot.kind === "letter" ? "Love letter" : "Small note",
      text: slot.text,
      savedAt: new Date().toISOString(),
      unlockHour: slot.part === "night" ? 23 : 0,
      unlockMinute: 0,
    }
  }

  function saveFromHerSlot(slot) {
    const delivery = deliveryFromSlot(slot)
    if (!delivery) return null
    upsertLocal(delivery)
    const code = getCoupleCode()
    if (code) {
      api(`/api/couple/${encodeURIComponent(code)}/deliveries/${encodeURIComponent(delivery.id)}`, {
        method: "PUT",
        body: JSON.stringify(delivery),
      }).catch(() => {})
    }
    return delivery
  }

  function syncWeekToInbox(week) {
    const deliveries = []
    ;(week || []).forEach((slot) => {
      const d = deliveryFromSlot(slot)
      if (d) {
        upsertLocal(d)
        deliveries.push(d)
      }
    })
    const code = getCoupleCode()
    if (code) {
      api(`/api/couple/${encodeURIComponent(code)}/week`, {
        method: "PUT",
        body: JSON.stringify({ week, deliveries }),
      }).catch(() => {})
    }
  }

  async function pairCouple(code, names = {}) {
    const clean = String(code || "").trim().toUpperCase()
    const data = await api("/api/couple", {
      method: "POST",
      body: JSON.stringify({
        code: clean,
        role: names.role || "her",
        herName: names.herName || "",
        hisName: names.hisName || "",
      }),
    })
    setCoupleCode(data.code)
    return data
  }

  async function pullInbox() {
    const code = getCoupleCode()
    if (!code) return getInbox()
    try {
      const data = await api(`/api/couple/${encodeURIComponent(code)}/inbox`)
      if (Array.isArray(data.deliveries)) setInbox(data.deliveries)
      return getInbox()
    } catch {
      return getInbox()
    }
  }

  function getTodayKey(from = new Date()) {
    return dateKeyInIndia(from)
  }

  function getTodayDelivery(part, from = new Date()) {
    const key = getTodayKey(from)
    return getInbox().find((d) => d.dateKey === key && d.part === part) || null
  }

  function getOpened() {
    return read(OPENED_KEY, [])
  }

  function markOpened(id) {
    const set = new Set(getOpened())
    set.add(id)
    write(OPENED_KEY, [...set])
  }

  function isDeliveryUnlocked(delivery, from = new Date()) {
    if (!delivery) return false
    const today = getTodayKey(from)
    if (delivery.dateKey !== today) return true
    const mins = from.getHours() * 60 + from.getMinutes()
    if (delivery.part === "night") return mins >= 23 * 60 || mins < 5 * 60
    return true
  }

  async function health() {
    return api("/api/health")
  }

  async function trackActivity(type, extra = {}) {
    const code = getCoupleCode()
    if (!code) return null
    try {
      return await api(`/api/couple/${encodeURIComponent(code)}/activity`, {
        method: "POST",
        body: JSON.stringify({ type, ...extra }),
      })
    } catch {
      return null
    }
  }

  async function trackAppOpen() {
    return trackActivity("open")
  }

  async function trackMessageRead(delivery) {
    if (!delivery?.id) return null
    return trackActivity("read", {
      deliveryId: delivery.id,
      dateKey: delivery.dateKey || "",
      part: delivery.part || "",
      dateLabel: delivery.dateLabel || "",
      whenLabel: delivery.whenLabel || "",
    })
  }

  async function fetchActivity() {
    const code = getCoupleCode()
    if (!code) throw new Error("Save your couple code first")
    return api(`/api/couple/${encodeURIComponent(code)}/activity`)
  }

  return {
    WEEK_KEY,
    getInbox,
    saveFromHerSlot,
    syncWeekToInbox,
    getTodayKey,
    getTodayDelivery,
    getOpened,
    markOpened,
    isDeliveryUnlocked,
    dateForWeekSlot,
    dateKey,
    dateKeyInIndia,
    getMondayKeyInIndia,
    addDaysToKey,
    formatDateKey,
    shortDateKey,
    stampWeekDates,
    planningMondayKey,
    formatDate,
    getMonday,
    getCoupleCode,
    setCoupleCode,
    getApiBase,
    setApiBase,
    pairCouple,
    pullInbox,
    health,
    trackAppOpen,
    trackMessageRead,
    fetchActivity,
    read,
    write,
  }
})()

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

  function formatDate(date) {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  function getMonday(from = new Date()) {
    const d = new Date(from)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + diff)
    return d
  }

  function dateForWeekSlot(dayIndex, from = new Date()) {
    const monday = getMonday(from)
    const d = new Date(monday)
    d.setDate(monday.getDate() + dayIndex)
    return d
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
    const when = dateForWeekSlot(slot.dayIndex)
    const key = dateKey(when)
    return {
      id: `${key}-${slot.part}`,
      slotId: slot.id,
      dateKey: key,
      dateLabel: formatDate(when),
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
    return dateKey(from)
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
    formatDate,
    getMonday,
    getCoupleCode,
    setCoupleCode,
    getApiBase,
    setApiBase,
    pairCouple,
    pullInbox,
    health,
    read,
    write,
  }
})()

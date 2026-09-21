/* The Blooms — service worker (required for iOS + Android push) */
const SW_VERSION = "blooms-sw-v4"

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {
    title: "The Blooms",
    body: "Something soft arrived for you.",
    url: "/",
  }

  try {
    if (event.data) {
      const parsed = event.data.json()
      data = { ...data, ...parsed }
    }
  } catch (_) {
    try {
      const text = event.data && event.data.text()
      if (text) data.body = text
    } catch (_) {}
  }

  const title = data.title || "The Blooms"
  const options = {
    body: data.body || "",
    icon: "/public/pwa-192.png",
    badge: "/public/pwa-192.png",
    data: { url: data.url || "/his-morning.html" },
    vibrate: [80, 40, 80],
    renotify: true,
    tag: data.part || "blooms",
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/his-morning.html"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})

// Loaded into the service worker (see vite.config.ts → workbox.importScripts).
// Shows Smart Pantry's push notifications and opens the right page when one is tapped.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Smart Pantry";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Some items need your attention.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "smart-pantry",
      renotify: true,
      data: { url: data.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

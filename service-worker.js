const CACHE = "forth-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/forth-192.png", "/icons/forth-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title || "Forth", {
    body: data.body || "I am",
    icon: "/icons/forth-192.png",
    badge: "/icons/forth-192.png",
    tag: data.tag || "forth-shock",
    renotify: false,
    data: { url: data.url || "/" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const openClient = clients.find((client) => client.url.startsWith(self.location.origin));
      return openClient ? openClient.focus().then(() => openClient.navigate(target)) : self.clients.openWindow(target);
    })
  );
});

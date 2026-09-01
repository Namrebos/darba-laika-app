const CACHE_NAME = "darba-laiks-static-v5";
const STATIC_FILES = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/",
  "/workday",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_FILES)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Kešojam tikai paša app statiskos failus
  const isSameOrigin = url.origin === self.location.origin;
  const isStaticFile =
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname.startsWith("/_next/static/");

  const isPage = event.request.mode === "navigate";

  if (!isSameOrigin || (!isStaticFile && !isPage) || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request).then((response) => response || (isPage ? caches.match("/workday") : undefined)))
      .then((networkResponse) => {
        if (!networkResponse) return new Response("Bezsaistes lapa nav pieejama.", { status: 503 });
        const responseClone = networkResponse.clone();

        if (networkResponse.ok) caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return networkResponse;
      }),
  );
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Darba laiks", {
      body: data.body || "Saņemts jauns paziņojums.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === targetUrl);
      return existing ? existing.focus() : self.clients.openWindow(targetUrl);
    }),
  );
});

// Handgeschreven service worker (geen plug-in: Lovable beheert de lockfile).
// Regels, in deze volgorde:
//  1. index.html komt ALTIJD van het netwerk, nooit uit de cache. Anders blijf
//     je na een publish op een oude build hangen.
//  2. Het versienummer zit in de cachenaam; bij activatie gaat al het oudere weg.
//  3. skipWaiting gebeurt pas nadat de gebruiker in de toast bevestigt.
//  4. Mail gaat nooit de cache in: alles richting Supabase blijft netwerk.
//  5. Noodrem: /?sw=off meldt deze worker af en leegt alle caches (zie README).
const VERSION = "v1";
const CACHE = `nomadix-${VERSION}`;

// Alleen de schil. De gehashte build-assets komen er tijdens het gebruik bij.
const SHELL = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Geen skipWaiting hier: de nieuwe versie wacht tot de gebruiker ja zegt.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "nomadix:skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Alles buiten deze origin (Supabase, avatars, fonts) laten we met rust:
  // mailinhoud hoort niet in een cache op het toestel.
  if (url.origin !== self.location.origin) return;

  // Regel 1: de pagina zelf altijd van het netwerk. Lukt dat niet (offline),
  // dan pas de laatst bekende versie.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || Response.error())),
    );
    return;
  }

  // Gehashte build-assets veranderen nooit van inhoud: cache eerst.
  if (url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});

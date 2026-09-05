// Precache the app shell and figures; serve same-origin GETs cache-first.
// Bump VERSION on every deploy so old caches are replaced.
const VERSION = "v1.1.0";
const CACHE = `morningfit-${VERSION}`;
const FIGURE_IDS = ["pushups", "jackknife", "situps", "prisoner_squeeze", "bird_dog", "superman", "cat_cow", "cobra", "cow_child", "squat_to_fold", "dog_lunge_rotation", "seated_side_stretch"];
const FIGURES = FIGURE_IDS.flatMap(id => [`./assets/figures/${id}_relaxed.svg`, `./assets/figures/${id}_flexed.svg`]);
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/router.js", "./js/ui.js", "./js/store.js", "./js/kv.js", "./js/seed.js", "./js/exercises.js",
  "./js/workout.js", "./js/session.js", "./js/clock.js", "./js/audio.js",
  "./js/views/plan.js", "./js/views/workout.js", "./js/views/bank.js", "./js/views/train.js", "./js/views/session.js", "./js/views/done.js",
  "./assets/icons/icon.svg", "./assets/icons/icon-180.png", "./assets/icons/icon-512.png",
  ...FIGURES,
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    })));
});

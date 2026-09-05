import { createStore } from "./store.js";
import { localAdapter, idbAdapter } from "./kv.js";
import { createDropbox } from "./dropbox.js";
import { createSync } from "./sync.js";
import { getExercise } from "./exercises.js";
import { startRouter, navigate } from "./router.js";
import { toast, closeSheets } from "./ui.js";
import * as plan from "./views/plan.js";
import * as workout from "./views/workout.js";
import * as bank from "./views/bank.js";
import * as train from "./views/train.js";
import * as session from "./views/session.js";
import * as done from "./views/done.js";

const KEY = "morningfit.v1";
const DROPBOX_APP_KEY = "4rmxsnol2k5kibm";   // public identifier of the "fitapp" Dropbox app (app-folder access)
const views = { plan, workout, bank, train, session, done };
const store = createStore({ local: localAdapter(localStorage, KEY), idb: idbAdapter() });
const dropbox = createDropbox({ appKey: DROPBOX_APP_KEY, redirectUri: location.origin + location.pathname, storage: localStorage });
const sync = createSync({ store, dropbox, storage: localStorage, online: () => navigator.onLine, go: url => { location.href = url; }, toast, getExercise });
let current = null;

async function boot() {
  const r = await store.load();
  if (r.seeded) toast("No saved workouts found, loaded defaults", 4000);
  else if (r.recovered) toast("Recovered workouts from the backup copy", 4000);
  navigator.storage?.persist?.().catch(() => {});

  // Returning from the Dropbox login: ?code=...&state=... (or ?error=...) on the app URL.
  const q = new URL(location.href).searchParams;
  if (q.has("code") || q.has("error")) {
    const code = q.get("code"), state = q.get("state"), err = q.get("error");
    history.replaceState(null, "", location.pathname + "#/plan");
    if (code) sync.finishConnect(code, state).catch(e => toast(`Dropbox connection failed: ${e?.message || e}`, 6000));
    else toast(err === "access_denied" ? "Dropbox connection cancelled" : "Dropbox connection failed", 4000);
  } else {
    sync.reconcile();
  }
  addEventListener("online", () => sync.reconcile());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync.reconcile(); });

  startRouter(route => {
    closeSheets();
    current?.destroy?.();
    const out = views[route.name].render({ store, sync, params: route.params, navigate });
    current = out;
    const main = document.getElementById("view");
    main.replaceChildren(out.el);
    main.classList.toggle("no-tabs", !out.tabs);
    const tabs = document.getElementById("tabs");
    tabs.hidden = !out.tabs;
    tabs.querySelectorAll("a").forEach(a => a.classList.toggle("active", a.dataset.tab === out.tabs));
    window.scrollTo(0, 0);
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    let announced = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (announced || !navigator.serviceWorker.controller) return;
      announced = true;
      toast("Updated. Reopen the app to use the new version.", 5000);
    });
  }
}

boot();

import { createStore } from "./store.js";
import { localAdapter, idbAdapter } from "./kv.js";
import { startRouter, navigate } from "./router.js";
import { toast, closeSheets } from "./ui.js";
import * as plan from "./views/plan.js";
import * as workout from "./views/workout.js";
import * as bank from "./views/bank.js";
import * as train from "./views/train.js";
import * as session from "./views/session.js";
import * as done from "./views/done.js";

const KEY = "morningfit.v1";
const views = { plan, workout, bank, train, session, done };
const store = createStore({ local: localAdapter(localStorage, KEY), idb: idbAdapter() });
let current = null;

async function boot() {
  const r = await store.load();
  if (r.seeded) toast("No saved workouts found, loaded defaults", 4000);
  else if (r.recovered) toast("Recovered workouts from the backup copy", 4000);
  navigator.storage?.persist?.().catch(() => {});

  startRouter(route => {
    closeSheets();
    current?.destroy?.();
    const out = views[route.name].render({ store, params: route.params, navigate });
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

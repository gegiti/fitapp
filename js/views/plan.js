import { el, replace, toast, confirmAsync, sheet } from "../ui.js";
import { totals, formatDuration, summaryLine, makeWorkout } from "../workout.js";
import { EXERCISES } from "../exercises.js";
import { formatSyncTime } from "../sync.js";

const LINE_TEXT = { saving: "Saving to Dropbox…", offline: "Offline · will sync when online", error: "Sync failed · tap to retry" };
const plural = n => `${n} workout${n === 1 ? "" : "s"}`;

export function render({ store, sync, navigate }) {
  const root = el("div", { class: "plan" });
  const lineHost = el("div", { class: "sync-host" });
  draw();
  const unsub = sync.subscribe(() => replace(lineHost, syncLine()));
  return { el: root, tabs: "plan", destroy: unsub };

  function draw() {
    const st = store.state;
    const cards = st.workouts.length
      ? st.workouts.map(w => {
          const t = totals(w);
          return el("button", { class: "card", onClick: () => navigate(`/plan/workout/${w.id}`) },
            el("div", { class: "row" }, el("span", { class: "name" }, w.name), el("span", { class: "dur" }, formatDuration(t.total))),
            el("div", { class: "sub" }, summaryLine(t) + (t.missing ? ` · ${t.missing} missing` : "")));
        })
      : [el("div", { class: "empty" }, "No workouts yet. Tap + to create one.")];

    replace(lineHost, syncLine());
    replace(root,
      store.saveError ? el("div", { class: "notice warn" }, "Changes are not being saved: storage is unavailable or full.") : null,
      el("div", { class: "header" },
        el("h1", {}, "Plan"),
        el("button", { class: "plus", "aria-label": "New workout", onClick: async () => {
          const w = makeWorkout(`Workout ${st.workouts.length + 1}`);
          st.workouts.push(w);
          await store.save();
          navigate(`/plan/workout/${w.id}`);
        } }, "+")),
      el("div", { class: "section-label" }, "WORKOUTS"),
      ...cards,
      el("button", { class: "card", style: { marginTop: "12px" }, onClick: () => navigate("/plan/bank") },
        el("div", { class: "row" }, el("span", {}, "Exercise bank"), el("span", { class: "dur" }, `${EXERCISES.length}  ›`))),
      lineHost,
    );
  }

  // The one line at the bottom of the view; a button in every state (spec 4.1).
  function syncLine() {
    const s = sync.status;
    if (s === "off") {
      return el("button", { class: "sync-line off", onClick: () => sync.connect() },
        el("span", { class: "main" }, "Connect Dropbox"), el("span", { class: "sub" }, "Workouts are only on this phone"));
    }
    const text = s === "synced" ? (sync.syncedAt ? `Synced to Dropbox · ${formatSyncTime(sync.syncedAt)}` : "Connected to Dropbox") : LINE_TEXT[s];
    return el("button", { class: `sync-line ${s}`, onClick: onSyncTap }, el("span", { class: "main" }, text), el("span", { class: "chev" }, "›"));
  }

  async function onSyncTap() {
    const s = sync.status;
    if (s === "offline") { toast("Dropbox is not reachable"); return; }
    if (s === "error") { await sync.retry(); return; }
    if (!(await confirmAsync("Load a saved configuration?\nYour current workouts will be kept in Dropbox as a new .bak file first."))) return;
    openConfigs();
  }

  function openConfigs() {
    const list = el("div", { class: "cfg-list" }, el("div", { class: "sub" }, "Loading…"));
    const close = sheet(el("div", {},
      el("h2", {}, "Saved configurations"),
      el("div", { class: "type" }, "Dropbox / Apps / fitapp"),
      list,
      el("button", { class: "block-btn cfg-disconnect", onClick: onDisconnect }, "Disconnect Dropbox"),
      el("button", { class: "btn raised", onClick: () => close() }, "Cancel")));

    sync.listConfigs()
      .then(rows => replace(list, rows.length ? rows.map(row) : el("div", { class: "sub" }, "No configurations in Dropbox yet.")))
      .catch(e => replace(list, el("div", { class: "sub" }, `Could not read Dropbox (${e?.message || "unknown error"}).`)));

    function row(r) {
      const when = r.ok ? formatSyncTime(r.savedAt) : "";
      const detail = r.ok ? plural(r.count) + (r.names.length ? " · " + r.names.join(", ") : "") : "unreadable";
      return el("button", { class: "cfg-row", dataset: { name: r.name }, disabled: !r.ok, onClick: () => pick(r) },
        el("div", { class: "top" }, el("span", { class: "fname" }, r.name), r.current ? el("span", { class: "tag" }, "current") : null, el("span", { class: "when" }, when)),
        el("div", { class: "detail" }, detail));
    }

    async function pick(r) {
      try {
        const res = await sync.loadConfig(r.name);
        close();
        toast(`Loaded ${res.name} · ${plural(res.count)}`);
        draw();
      } catch { toast(`Could not load ${r.name}`, 4000); }
    }

    async function onDisconnect() {
      if (!(await confirmAsync("Disconnect Dropbox? Workouts stay on this phone and in Dropbox."))) return;
      await sync.disconnect();
      close();
      draw();
    }
  }
}

// Dropbox sync: pure rules first (tested without IO), then the engine that applies them.
import { parseState, validateBackup } from "./store.js";
import { DropboxAuthError } from "./dropbox.js";

export const CFG = "fitapp.cfg";
const BAK_RE = /^fitapp\.cfg\.bak\.(\d+)$/;

export const isConfigName = name => name === CFG || BAK_RE.test(name);

// Lowest unused integer from 1. Names with leading zeros are not ours and are ignored.
export function nextBakName(names) {
  const used = new Set();
  for (const n of names) { const m = BAK_RE.exec(n); if (m && String(Number(m[1])) === m[1]) used.add(Number(m[1])); }
  let i = 1;
  while (used.has(i)) i++;
  return `fitapp.cfg.bak.${i}`;
}

// The decision table of spec 5.2. Only savedAt (inside the file) decides direction; rev only
// tells whether someone else wrote the remote file since we last saw it.
export function decide({ localSavedAt, syncedSavedAt, remoteRev, remote }) {
  if (!remote) return { action: "push" };
  const r = remote.savedAt ?? "", l = localSavedAt ?? "";
  if (r === l) return { action: "none" };
  const dirty = localSavedAt !== syncedSavedAt;
  if (r > l) return { action: dirty ? "archiveLocalThenPull" : "pull" };
  return { action: remote.rev === remoteRev ? "push" : "archiveRemoteThenPush" };
}

export const configText = state => JSON.stringify({ version: 1, savedAt: state.savedAt, workouts: state.workouts }, null, 2);

export function describeConfig(text) {
  const st = parseState(text);
  if (!st) return null;
  return { savedAt: st.savedAt, count: st.workouts.length, names: st.workouts.map(w => w.name) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = n => String(n).padStart(2, "0");
export function formatSyncTime(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? `today ${hm}` : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${hm}`;
}

// ---------------------------------------------------------------- engine
const DEBOUNCE_MS = 1500;
const RETRY_MS = [5000, 30000];

// WebKit throws "Can only call Window.setTimeout on instances of Window" when the timer functions
// are called as methods of another object, so the defaults go through the global explicitly.
const defaultTimers = { setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: id => globalThis.clearTimeout(id) };

// status: off | synced | saving | offline | error. Every timer and network call is injected.
export function createSync({ store, dropbox, storage, key = "morningfit.sync.v1", online = () => true, go, toast = () => {}, getExercise, timers = defaultTimers }) {
  const subs = new Set();
  const readRec = () => { try { return JSON.parse(storage.getItem(key)) || {}; } catch { return {}; } };
  const writeRec = rec => storage.setItem(key, JSON.stringify(rec));
  let inFlight = false, failures = 0, timer = null, pendingRetry = null, wantPush = false, lastError = null;

  const notify = () => subs.forEach(fn => fn(sync));
  const dirty = () => store.state.savedAt !== readRec().syncedSavedAt;
  const markSynced = (savedAt, rev) => writeRec({ syncedSavedAt: savedAt, remoteRev: rev });

  function computeStatus() {
    if (!dropbox.isConnected()) return "off";
    if (!online()) return "offline";
    if (inFlight || timer || pendingRetry) return "saving";
    if (failures > RETRY_MS.length) return "error";
    return "synced";
  }

  function clearDebounce() { if (timer) { timers.clearTimeout(timer); timer = null; } }
  function clearTimers() {
    clearDebounce();
    if (pendingRetry) { timers.clearTimeout(pendingRetry); pendingRetry = null; }
  }

  async function handleError(e) {
    if (e instanceof DropboxAuthError) {
      clearTimers(); failures = 0;
      toast(e.tag === "missing_scope"
        ? "Dropbox app is missing permissions. Enable them in the Dropbox console, then connect again."
        : "Dropbox disconnected, connect again", 5000);
      return;
    }
    failures++;
    lastError = e?.message || String(e);
    const wait = RETRY_MS[failures - 1];
    if (wait != null) pendingRetry = timers.setTimeout(() => { pendingRetry = null; return push(); }, wait);
    else toast(`Sync failed: ${lastError}`, 5000);
  }

  // Upload the phone state as fitapp.cfg. No-op when nothing changed since the last successful push.
  async function push() {
    if (!dropbox.isConnected() || !online()) { notify(); return false; }
    if (inFlight) { wantPush = true; return true; }
    if (!dirty()) { failures = 0; clearDebounce(); notify(); return true; }
    inFlight = true; notify();
    let ok = false;
    try {
      const savedAt = store.state.savedAt;
      const { rev } = await dropbox.upload(CFG, configText(store.state));
      markSynced(savedAt, rev);
      failures = 0; lastError = null; ok = true;
      clearDebounce();
    } catch (e) { await handleError(e); }
    finally { inFlight = false; }
    if (wantPush || (dirty() && failures === 0)) { wantPush = false; return push(); }
    notify();
    return ok;
  }

  async function archiveText(text, names) {
    const bak = nextBakName(names);
    await dropbox.upload(bak, text);
    return bak;
  }

  async function archiveRemote() {
    const names = (await dropbox.list()).map(f => f.name);
    if (!names.includes(CFG)) return null;
    const bak = nextBakName(names);
    await dropbox.move(CFG, bak);
    return bak;
  }

  // Record first, then replace with touch:false, so the store subscriber sees a clean state.
  async function applyRemote(remote) {
    const st = parseState(remote.text);
    markSynced(st.savedAt, remote.rev);
    await store.replace(st, { touch: false });
  }

  const sync = {
    get status() { return computeStatus(); },
    get syncedAt() { return readRec().syncedSavedAt ?? null; },
    get lastError() { return lastError; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    async connect() { go(await dropbox.authorizeUrl()); },

    // After the OAuth redirect: archive any existing remote file, then push the phone state (spec 4.2).
    // A redirect that completes no login (already connected) only reconciles.
    async finishConnect(code, state) {
      if (!(await dropbox.finishAuth(code, state))) return sync.reconcile();
      failures = 0; writeRec({});
      try {
        const bak = await archiveRemote();
        const ok = await push();
        if (bak) toast(`Previous Dropbox config kept as ${bak}`);
        else if (ok) toast("Connected to Dropbox");
        else if (lastError) toast(`Connected to Dropbox, but saving failed: ${lastError}`, 5000);
      } catch (e) { await handleError(e); }
      notify();
    },

    pushSoon() {
      if (!dropbox.isConnected()) return;
      clearDebounce();
      timer = timers.setTimeout(() => { timer = null; return push(); }, DEBOUNCE_MS);
      notify();
    },

    async reconcile() {
      if (!dropbox.isConnected() || !online() || inFlight) { notify(); return; }
      try {
        const remote = await dropbox.download(CFG);
        const parsed = remote ? parseState(remote.text) : null;
        const rec = readRec();
        const d = decide({ localSavedAt: store.state.savedAt, syncedSavedAt: rec.syncedSavedAt, remoteRev: rec.remoteRev, remote: remote && { savedAt: parsed?.savedAt ?? null, rev: remote.rev } });
        if (remote && !parsed && d.action !== "none") toast("Dropbox file is unreadable, keeping phone workouts");
        switch (d.action) {
          case "none": markSynced(store.state.savedAt, remote.rev); failures = 0; break;
          case "push": await push(); break;
          case "pull": await applyRemote(remote); toast("Updated from Dropbox"); break;
          case "archiveLocalThenPull": {
            const names = (await dropbox.list()).map(f => f.name);
            await archiveText(configText(store.state), names);
            await applyRemote(remote); toast("Updated from Dropbox"); break;
          }
          case "archiveRemoteThenPush": await archiveRemote(); await push(); break;
        }
      } catch (e) { await handleError(e); }
      notify();
    },

    async retry() { clearTimers(); failures = 0; await sync.reconcile(); },

    async listConfigs() {
      const entries = (await dropbox.list()).filter(f => isConfigName(f.name));
      const rows = await Promise.all(entries.map(async f => {
        const file = await dropbox.download(f.name);
        const d = file && describeConfig(file.text);
        return { name: f.name, current: f.name === CFG, ok: Boolean(d), savedAt: d?.savedAt ?? null, count: d?.count ?? 0, names: d?.names ?? [] };
      }));
      rows.sort((a, b) => (b.current - a.current) || String(b.savedAt ?? "").localeCompare(String(a.savedAt ?? "")));
      return rows;
    },

    // Spec 4.3 step 3: archive the phone state, apply the chosen file, push it as fitapp.cfg.
    async loadConfig(name) {
      const chosen = await dropbox.download(name);
      const obj = (() => { try { return JSON.parse(chosen?.text ?? ""); } catch { return null; } })();
      const v = obj && validateBackup(obj, getExercise);
      if (!v?.ok) throw new Error(`${name} is unreadable`);
      const names = (await dropbox.list()).map(f => f.name);
      await archiveText(configText(store.state), names);
      clearTimers();
      await store.replace(v.state);           // touched: this load is a new save on the phone
      await push();
      notify();
      return { name, count: v.workouts };
    },

    async disconnect() {
      clearTimers(); failures = 0;
      await dropbox.disconnect();
      storage.removeItem(key);
      notify();
    },
  };

  store.subscribe(() => { if (dropbox.isConnected() && online() && dirty()) sync.pushSoon(); else notify(); });
  return sync;
}

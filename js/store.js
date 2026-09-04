// State persistence: one JSON document written to two adapters, newest copy wins on load.
import { seedState } from "./seed.js";

const isNum = v => typeof v === "number" && Number.isFinite(v);

function normalizeStep(s) {
  if (!s || typeof s.exerciseId !== "string" || !isNum(s.seconds) || !isNum(s.restSeconds)) return null;
  return { exerciseId: s.exerciseId, seconds: Math.max(0, Math.round(s.seconds)), restSeconds: Math.max(0, Math.round(s.restSeconds)) };
}

function normalizeWorkout(w) {
  if (!w || typeof w.id !== "string" || typeof w.name !== "string" || !Array.isArray(w.steps)) return null;
  const steps = w.steps.map(normalizeStep);
  if (steps.includes(null)) return null;
  return { id: w.id, name: w.name, steps };
}

function normalizeState(obj) {
  if (!obj || obj.version !== 1 || !Array.isArray(obj.workouts)) return null;
  const workouts = obj.workouts.map(normalizeWorkout);
  if (workouts.includes(null)) return null;
  return {
    version: 1,
    savedAt: typeof obj.savedAt === "string" ? obj.savedAt : null,
    lastBackupAt: typeof obj.lastBackupAt === "string" ? obj.lastBackupAt : null,
    workouts,
  };
}

export function parseState(raw) {
  if (typeof raw !== "string") return null;
  try { return normalizeState(JSON.parse(raw)); } catch { return null; }
}

export function validateBackup(obj, getEx) {
  if (!obj || typeof obj !== "object") return { ok: false, error: "Not a Morning Fit backup file." };
  if (obj.version !== 1) return { ok: false, error: `Unsupported backup version: ${obj.version}.` };
  if (!Array.isArray(obj.workouts)) return { ok: false, error: "Backup has no workouts list." };
  let dropped = 0;
  const workouts = [];
  for (const w of obj.workouts) {
    if (!w || typeof w.name !== "string" || !Array.isArray(w.steps)) continue;
    const steps = [];
    for (const s of w.steps) {
      const n = normalizeStep(s);
      if (n && getEx(n.exerciseId)) steps.push(n); else dropped++;
    }
    workouts.push({ id: typeof w.id === "string" ? w.id : `w_${Math.random().toString(36).slice(2, 10)}`, name: w.name, steps });
  }
  return { ok: true, dropped, workouts: workouts.length, state: { version: 1, savedAt: null, lastBackupAt: null, workouts } };
}

export function createStore({ local, idb, now = () => new Date().toISOString(), seed = seedState }) {
  const subs = new Set();
  const store = {
    state: null,
    saveError: null,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    async load() {
      const [rawLocal, rawIdb] = await Promise.all([local.get(), idb.get()]);
      const candidates = [];
      let corrupt = false;
      for (const [raw, adapter] of [[rawLocal, local], [rawIdb, idb]]) {
        if (raw == null) continue;
        const parsed = parseState(raw);
        if (parsed) candidates.push(parsed);
        else { corrupt = true; if (adapter.stash) await adapter.stash(".corrupt", raw); }
      }
      candidates.sort((a, b) => String(b.savedAt ?? "").localeCompare(String(a.savedAt ?? "")));
      if (candidates.length) {
        store.state = candidates[0];
        if (corrupt || candidates.length < 2) await store.save();   // heal the missing/corrupt copy
        return { seeded: false, recovered: corrupt };
      }
      store.state = seed();
      await store.save();
      return { seeded: true, recovered: false };
    },

    async save() {
      store.state.savedAt = now();
      const s = JSON.stringify(store.state);
      store.saveError = null;
      try { await local.set(s); } catch (e) { store.saveError = e; }
      await idb.set(s);
      subs.forEach(fn => fn(store.state));
    },

    async replace(state) { store.state = state; await store.save(); },
    async markBackup() { store.state.lastBackupAt = now(); await store.save(); },
  };
  return store;
}

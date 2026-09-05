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

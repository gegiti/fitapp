// Tiny string key-value adapters with the same async shape: { get(): string|null, set(string) }.
export function memoryAdapter() {
  let v = null;
  return { async get() { return v; }, async set(s) { v = s; } };
}

export function localAdapter(storage, key) {
  return {
    async get() { try { return storage.getItem(key); } catch { return null; } },
    async set(s) { storage.setItem(key, s); },   // may throw (quota, private mode): store records it
    async stash(suffix, s) { try { storage.setItem(key + suffix, s); } catch { /* best effort */ } },
  };
}

export function idbAdapter(dbName = "morningfit", key = "state") {
  const STORE = "kv";
  function open() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); resolve(r.result ?? null); };
      t.onerror = () => { db.close(); reject(t.error); };
    }));
  }
  return {
    async get() { try { return await tx("readonly", s => s.get(key)); } catch { return null; } },
    async set(v) { try { await tx("readwrite", s => s.put(v, key)); } catch { /* best effort */ } },
  };
}

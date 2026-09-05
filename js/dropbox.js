// Dropbox client for the app folder. Browser-only OAuth (PKCE + refresh token, no secret) and
// the four file calls the sync needs. Plain fetch; every dependency is injectable for tests.
const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

export class DropboxError extends Error {
  constructor(message, status, tag) { super(message); this.name = "DropboxError"; this.status = status; this.tag = tag; }
}
export class DropboxAuthError extends DropboxError {
  constructor(message, tag = "auth") { super(message, 401, tag); this.name = "DropboxAuthError"; }
}

// Requested explicitly so a console misconfiguration fails on the login page, not silently later.
const SCOPES = "files.metadata.read files.content.read files.content.write";

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function createDropbox({ appKey, redirectUri, storage, key = "morningfit.dropbox.v1", fetch = globalThis.fetch, crypto = globalThis.crypto, now = () => Date.now() }) {
  const read = () => { try { return JSON.parse(storage.getItem(key)) || {}; } catch { return {}; } };
  const write = rec => storage.setItem(key, JSON.stringify(rec));
  const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

  async function tokenRequest(params) {
    const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: appKey, ...params }).toString() });
    if (!res.ok) throw new DropboxAuthError(`Token request failed (${res.status})`);
    const j = await res.json();
    const rec = { ...read(), accessToken: j.access_token, expiresAt: now() + (j.expires_in ?? 14400) * 1000 };
    if (j.refresh_token) rec.refreshToken = j.refresh_token;
    delete rec.verifier; delete rec.state;
    write(rec);
    return rec.accessToken;
  }

  async function refresh() {
    const { refreshToken } = read();
    if (!refreshToken) throw new DropboxAuthError("Not connected");
    try { return await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }); }
    catch (e) { storage.removeItem(key); throw e; }
  }

  async function accessToken() {
    const rec = read();
    if (rec.accessToken && rec.expiresAt > now() + 60_000) return rec.accessToken;
    return refresh();
  }

  // error_summary looks like "path/not_found/.." or "to/conflict/file/.."; keep the tag part only.
  async function throwFor(res) {
    let body = null;
    try { body = await res.json(); } catch { /* not json */ }
    const tag = typeof body?.error_summary === "string" ? body.error_summary.replace(/\/\.*$/, "").replace(/\/+$/, "") : null;
    throw new DropboxError(`Dropbox ${res.status}${tag ? ` ${tag}` : ""}`, res.status, tag);
  }

  // One authenticated POST; on 401 refresh once and retry. With `arg` it is a content endpoint
  // (Dropbox-API-Arg header, raw body), otherwise an RPC endpoint with a JSON body.
  async function call(url, { arg, body, contentType } = {}) {
    let token = await accessToken();
    for (let attempt = 0; ; attempt++) {
      const headers = { Authorization: `Bearer ${token}` };
      let payload;
      if (arg !== undefined) { headers["Dropbox-API-Arg"] = JSON.stringify(arg); headers["Content-Type"] = contentType ?? "application/octet-stream"; payload = body; }
      else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body ?? null); }
      const res = await fetch(url, { method: "POST", headers, body: payload });
      if (res.status === 401 && attempt === 0) { token = await refresh(); continue; }
      if (res.status === 401) {   // still unauthorized with a fresh token: the grant is unusable (e.g. missing_scope)
        let tag = null;
        try { tag = (await res.json())?.error?.[".tag"] ?? null; } catch { /* no body */ }
        storage.removeItem(key);
        throw new DropboxAuthError(`Dropbox rejected the token${tag ? ` (${tag})` : ""}`, tag ?? "auth");
      }
      if (!res.ok) await throwFor(res);
      return res;
    }
  }

  return {
    async authorizeUrl() {
      const verifier = random(), state = random();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      write({ ...read(), verifier, state });
      const q = new URLSearchParams({ client_id: appKey, response_type: "code", code_challenge: b64url(new Uint8Array(digest)), code_challenge_method: "S256", token_access_type: "offline", scope: SCOPES, redirect_uri: redirectUri, state });
      return `${AUTH_URL}?${q}`;
    },
    async finishAuth(code, state) {
      const rec = read();
      if (!rec.verifier || rec.state !== state) throw new DropboxAuthError("Login state mismatch");
      await tokenRequest({ grant_type: "authorization_code", code, code_verifier: rec.verifier, redirect_uri: redirectUri });
    },
    isConnected() { return Boolean(read().refreshToken); },
    async disconnect() {
      try { await call(`${API}/auth/token/revoke`); } catch { /* best effort */ }
      storage.removeItem(key);
    },
    async list() {
      const out = [];
      let res = await call(`${API}/files/list_folder`, { body: { path: "" } });
      let j = await res.json();
      for (;;) {
        for (const e of j.entries) if (e[".tag"] === "file") out.push({ name: e.name, rev: e.rev });
        if (!j.has_more) return out;
        res = await call(`${API}/files/list_folder/continue`, { body: { cursor: j.cursor } });
        j = await res.json();
      }
    },
    async download(name) {
      try {
        const res = await call(`${CONTENT}/files/download`, { arg: { path: `/${name}` }, contentType: "text/plain" });
        const meta = JSON.parse(res.headers.get("Dropbox-API-Result") || "{}");
        return { text: await res.text(), rev: meta.rev };
      } catch (e) {
        if (e instanceof DropboxError && e.status === 409 && /not_found/.test(e.tag ?? "")) return null;
        throw e;
      }
    },
    async upload(name, text) {
      const res = await call(`${CONTENT}/files/upload`, { arg: { path: `/${name}`, mode: "overwrite", mute: true }, body: text });
      return { rev: (await res.json()).rev };
    },
    async move(from, to) {
      await call(`${API}/files/move_v2`, { body: { from_path: `/${from}`, to_path: `/${to}`, autorename: false } });
    },
  };
}

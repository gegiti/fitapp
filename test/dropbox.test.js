import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createDropbox, DropboxError, DropboxAuthError } from "../js/dropbox.js";

function fakeStorage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; }
function jsonRes(status, body, headers = {}) {
  return { ok: status < 300, status, headers: { get: h => headers[h] ?? null }, async json() { return body; }, async text() { return typeof body === "string" ? body : JSON.stringify(body); } };
}
// A scripted fetch: each call shifts the next response; records requests.
function fakeFetch(script) {
  const calls = [];
  const f = async (url, init = {}) => { calls.push({ url, init }); const r = script.shift(); if (!r) throw new Error("no scripted response for " + url); return typeof r === "function" ? r() : r; };
  f.calls = calls; return f;
}
const connected = () => JSON.stringify({ refreshToken: "R", accessToken: "A", expiresAt: Date.now() + 3600e3 });

test("authorizeUrl carries PKCE and offline access, and stores the verifier", async () => {
  const storage = fakeStorage();
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/y/", storage, fetch: fakeFetch([]), crypto: webcrypto });
  const url = new URL(await db.authorizeUrl());
  assert.equal(url.origin + url.pathname, "https://www.dropbox.com/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "KEY");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("token_access_type"), "offline");
  assert.equal(url.searchParams.get("redirect_uri"), "https://x/y/");
  const login = JSON.parse(storage.getItem("morningfit.dropbox.v1.login"));
  assert.ok(login.verifier.length >= 43);
  assert.equal(url.searchParams.get("state"), login.state);
  assert.equal(db.isConnected(), false);
});

test("finishAuth exchanges the code with the verifier and stores tokens", async () => {
  const storage = fakeStorage();
  const fetch = fakeFetch([jsonRes(200, { access_token: "A", refresh_token: "R", expires_in: 14400 })]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/y/", storage, fetch, now: () => 1000, crypto: webcrypto });
  await db.authorizeUrl();
  const { verifier, state } = JSON.parse(storage.getItem("morningfit.dropbox.v1.login"));
  await db.finishAuth("CODE", state);
  const body = new URLSearchParams(fetch.calls[0].init.body);
  assert.equal(fetch.calls[0].url, "https://api.dropboxapi.com/oauth2/token");
  assert.deepEqual([body.get("code"), body.get("grant_type"), body.get("client_id"), body.get("code_verifier"), body.get("redirect_uri")], ["CODE", "authorization_code", "KEY", verifier, "https://x/y/"]);
  const rec = JSON.parse(storage.getItem("morningfit.dropbox.v1"));
  assert.deepEqual([rec.accessToken, rec.refreshToken, rec.expiresAt], ["A", "R", 1000 + 14400e3]);
  assert.equal(db.isConnected(), true);
});

test("finishAuth rejects a state mismatch", async () => {
  const storage = fakeStorage();
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch: fakeFetch([]), crypto: webcrypto });
  await db.authorizeUrl();
  await assert.rejects(db.finishAuth("CODE", "wrong"), DropboxAuthError);
});

test("list pages through list_folder and returns names and revs", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([
    jsonRes(200, { entries: [{ ".tag": "file", name: "fitapp.cfg", rev: "r1" }, { ".tag": "folder", name: "junk" }], has_more: true, cursor: "C" }),
    jsonRes(200, { entries: [{ ".tag": "file", name: "fitapp.cfg.bak.1", rev: "r2" }], has_more: false }),
  ]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  assert.deepEqual(await db.list(), [{ name: "fitapp.cfg", rev: "r1" }, { name: "fitapp.cfg.bak.1", rev: "r2" }]);
  assert.equal(fetch.calls[0].url, "https://api.dropboxapi.com/2/files/list_folder");
  assert.equal(JSON.parse(fetch.calls[0].init.body).path, "");
  assert.equal(fetch.calls[0].init.headers.Authorization, "Bearer A");
  assert.equal(fetch.calls[1].url, "https://api.dropboxapi.com/2/files/list_folder/continue");
  assert.equal(JSON.parse(fetch.calls[1].init.body).cursor, "C");
});

test("download returns text and rev, or null when the file is missing", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([
    jsonRes(200, "{\"version\":1}", { "Dropbox-API-Result": JSON.stringify({ rev: "r9" }) }),
    jsonRes(409, { error_summary: "path/not_found/..", error: { ".tag": "path", path: { ".tag": "not_found" } } }),
  ]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  assert.deepEqual(await db.download("fitapp.cfg"), { text: "{\"version\":1}", rev: "r9" });
  assert.equal(JSON.parse(fetch.calls[0].init.headers["Dropbox-API-Arg"]).path, "/fitapp.cfg");
  assert.equal(await db.download("fitapp.cfg"), null);
});

test("upload overwrites and returns the new rev; move posts from/to", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([jsonRes(200, { rev: "r2" }), jsonRes(200, { metadata: {} })]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  assert.deepEqual(await db.upload("fitapp.cfg", "{}"), { rev: "r2" });
  const arg = JSON.parse(fetch.calls[0].init.headers["Dropbox-API-Arg"]);
  assert.deepEqual([arg.path, arg.mode, arg.mute, fetch.calls[0].init.body], ["/fitapp.cfg", "overwrite", true, "{}"]);
  await db.move("fitapp.cfg", "fitapp.cfg.bak.1");
  assert.equal(fetch.calls[1].url, "https://api.dropboxapi.com/2/files/move_v2");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), { from_path: "/fitapp.cfg", to_path: "/fitapp.cfg.bak.1", autorename: false });
});

test("a 401 refreshes the token once and retries; a failed refresh disconnects", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([
    jsonRes(401, { error_summary: "expired_access_token/" }),
    jsonRes(200, { access_token: "A2", expires_in: 14400 }),
    jsonRes(200, { entries: [], has_more: false }),
    jsonRes(401, { error_summary: "expired_access_token/" }),
    jsonRes(400, { error: "invalid_grant" }),
  ]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  assert.deepEqual(await db.list(), []);
  assert.equal(new URLSearchParams(fetch.calls[1].init.body).get("grant_type"), "refresh_token");
  assert.equal(fetch.calls[2].init.headers.Authorization, "Bearer A2");
  await assert.rejects(db.list(), DropboxAuthError);
  assert.equal(db.isConnected(), false);
});

test("an expired access token is refreshed before the call; other errors are DropboxError with a tag", async () => {
  const storage = fakeStorage();
  storage.setItem("morningfit.dropbox.v1", JSON.stringify({ refreshToken: "R", accessToken: "A", expiresAt: 5 }));
  const fetch = fakeFetch([jsonRes(200, { access_token: "A2", expires_in: 100 }), jsonRes(409, { error_summary: "to/conflict/file/..", error: {} })]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch, now: () => 1000 });
  await assert.rejects(db.move("a", "b"), e => e instanceof DropboxError && e.status === 409 && e.tag === "to/conflict/file");
  assert.equal(fetch.calls[0].url, "https://api.dropboxapi.com/oauth2/token");
});

test("disconnect revokes best-effort and forgets tokens", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([() => { throw new Error("offline"); }]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  await db.disconnect();
  assert.equal(db.isConnected(), false);
  assert.equal(storage.getItem("morningfit.dropbox.v1"), null);
});

test("authorizeUrl requests the three file scopes explicitly", async () => {
  const storage = fakeStorage();
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch: fakeFetch([]), crypto: webcrypto });
  const url = new URL(await db.authorizeUrl());
  assert.equal(url.searchParams.get("scope"), "files.metadata.read files.content.read files.content.write");
});

test("a 401 that survives the token refresh disconnects and carries the error tag", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const scopeErr = { error_summary: "missing_scope/..", error: { ".tag": "missing_scope", required_scope: "files.metadata.read" } };
  const fetch = fakeFetch([jsonRes(401, scopeErr), jsonRes(200, { access_token: "A2", expires_in: 14400 }), jsonRes(401, scopeErr)]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  await assert.rejects(db.list(), e => e instanceof DropboxAuthError && e.tag === "missing_scope");
  assert.equal(db.isConnected(), false);
});

test("the pending login survives a token refresh and a disconnect, and is consumed by finishAuth", async () => {
  const storage = fakeStorage();
  storage.setItem("morningfit.dropbox.v1", JSON.stringify({ refreshToken: "R", accessToken: "A", expiresAt: 5 }));
  const fetch = fakeFetch([
    jsonRes(200, { access_token: "A2", expires_in: 100 }), jsonRes(200, { entries: [], has_more: false }),   // refresh + list
    jsonRes(200, {}),                                                                                          // revoke
    jsonRes(200, { access_token: "A3", refresh_token: "R3", expires_in: 100 }),                                 // code exchange
  ]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch, now: () => 1000, crypto: webcrypto });
  const url = new URL(await db.authorizeUrl());
  assert.equal(url.searchParams.get("force_reapprove"), "true");
  await db.list();                 // refreshes the access token
  await db.disconnect();           // forgets the tokens
  assert.ok(JSON.parse(storage.getItem("morningfit.dropbox.v1.login")).verifier, "login record kept");
  await db.finishAuth("CODE", url.searchParams.get("state"));
  assert.equal(db.isConnected(), true);
  assert.equal(storage.getItem("morningfit.dropbox.v1.login"), null, "login record consumed");
});

test("finishAuth is a no-op when the login was already completed (redirect loaded twice)", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  await db.finishAuth("CODE", "whatever");
  assert.equal(fetch.calls.length, 0);
  assert.equal(db.isConnected(), true);
});

test("finishAuth reports Dropbox's error when the code exchange is rejected", async () => {
  const storage = fakeStorage();
  const fetch = fakeFetch([jsonRes(400, { error: "invalid_grant", error_description: "code has expired" })]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch, crypto: webcrypto });
  const url = new URL(await db.authorizeUrl());
  await assert.rejects(db.finishAuth("CODE", url.searchParams.get("state")), e => e instanceof DropboxAuthError && /invalid_grant.*code has expired/.test(e.message));
  assert.equal(storage.getItem("morningfit.dropbox.v1.login"), null, "login record consumed even on failure");
});

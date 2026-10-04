import test from "node:test";
import assert from "node:assert/strict";
import { unlock, cues, keepAudioAlive } from "../js/audio.js";

// One context for the whole file: a page gets a single AudioContext and the module caches it,
// so every test works against the same object and resets its state first.
const ctx = {
  state: "suspended",
  currentTime: 0,
  resumes: 0,
  oscillators: [],
  resume() { ctx.resumes++; ctx.state = "running"; return Promise.resolve(); },
  createOscillator() { const o = { frequency: {}, connect: () => o, start() {}, stop() {} }; ctx.oscillators.push(o); return o; },
  createGain() { const g = { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => g }; return g; },
  destination: {},
};
globalThis.window = globalThis;            // in a browser these are the same object
globalThis.AudioContext = function () { return ctx; };

function reset(state) { ctx.state = state; ctx.resumes = 0; ctx.oscillators.length = 0; }

function fakeDocument() {
  const listeners = {};
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: (type, h) => { (listeners[type] ||= []).push(h); },
    removeEventListener: (type, h) => { listeners[type] = (listeners[type] || []).filter(x => x !== h); },
  };
  return (type) => [...(listeners[type] || [])].forEach(h => h());
}

test("unlock resumes the context whenever it is not running, including WebKit's interrupted state", () => {
  reset("suspended");
  unlock();
  assert.equal(ctx.resumes, 1, "a context created suspended must be resumed");
  // iOS hands the page back an interrupted context after a call, another app's audio, or backgrounding.
  ctx.state = "interrupted";
  unlock();
  assert.equal(ctx.resumes, 2, "an interrupted context must be resumed too");
  ctx.state = "running";
  unlock();
  assert.equal(ctx.resumes, 2, "a running context is left alone");
});

test("a cue arriving on a stopped context is dropped, not queued, and asks for a resume", () => {
  reset("suspended");                      // the OS took the audio session mid-session
  cues.end();
  assert.equal(ctx.oscillators.length, 0, "the clock is frozen, so a scheduled tone would fire late in a burst");
  assert.equal(ctx.resumes, 1, "the cue should try to get the context back for next time");
  reset("running");
  cues.end();
  assert.equal(ctx.oscillators.length, 1, "a running context still plays the tone");
  assert.equal(ctx.resumes, 0, "and needs no resume");
});

test("keepAudioAlive re-arms audio on a tap and on returning to the app, until it is stopped", () => {
  reset("suspended");
  const fire = fakeDocument();
  const stop = keepAudioAlive();
  fire("touchend");
  assert.equal(ctx.state, "running", "any tap during the session re-arms audio");
  ctx.state = "interrupted";
  fire("click");
  assert.equal(ctx.state, "running", "a click re-arms audio too");
  ctx.state = "interrupted";
  fire("visibilitychange");
  assert.equal(ctx.state, "running", "coming back to the app re-arms audio");
  stop();
  ctx.state = "suspended";
  fire("touchend");
  fire("click");
  fire("visibilitychange");
  assert.equal(ctx.state, "suspended", "a torn-down session no longer touches audio");
});

test("keepAudioAlive listens on events iOS counts as a user activation, not pointerdown", () => {
  const types = [];
  globalThis.document = { addEventListener: t => types.push(t), removeEventListener() {} };
  keepAudioAlive();
  assert.ok(types.includes("touchend") && types.includes("click"));
  assert.ok(!types.includes("pointerdown"), "a touch pointerdown cannot resume audio in WebKit");
});

test("unlock asks iOS to mix with other apps' audio", () => {
  const audioSession = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", { value: { audioSession }, configurable: true });
  reset("running");
  unlock();
  assert.equal(audioSession.type, "ambient");
});

test("a context WebKit refuses to resume is replaced on the next tap", async () => {
  let made = 0;
  const stuck = { state: "interrupted", resume: () => Promise.reject(new Error("refused")), close: () => Promise.resolve() };
  const fresh = { ...ctx, state: "suspended", resume() { fresh.state = "running"; return Promise.resolve(); } };
  const realAC = globalThis.AudioContext;
  globalThis.AudioContext = function () { made++; return made === 1 ? stuck : fresh; };
  // Swap the cached context for the stuck one by closing the shared one first.
  ctx.state = "closed";
  unlock();                                // creates "stuck", resume rejects
  await new Promise(r => setTimeout(r, 0));
  unlock();                                // next tap: a fresh context
  assert.equal(made, 2);
  assert.equal(fresh.state, "running");
  globalThis.AudioContext = realAC;
});

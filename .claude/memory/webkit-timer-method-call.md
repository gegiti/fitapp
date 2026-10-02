---
name: webkit-timer-method-call
description: Safari throws "Can only call Window.setTimeout on instances of Window" when setTimeout is stored in an object and called as a method; always wrap with globalThis
metadata:
  type: feedback
---

Injected-timer pattern `timers = { setTimeout, clearTimeout }` then `timers.setTimeout(fn, ms)` works in Node and Chrome but throws in WebKit (iOS PWA) because `this` is the timers object. Found 2026-09-05 in Morning Fit's sync engine; it silently broke every debounce, retry and error path on the phone while all tests and headless Chromium passed.

**Why:** WebKit enforces the receiver on Window methods; Chromium does not. Headless-Chromium e2e tests cannot catch it.

**How to apply:** Default to `{ setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: id => globalThis.clearTimeout(id) }`. The same applies to any Window method captured into an object (fetch, requestAnimationFrame). Keep the regression test in `test/sync.test.js` that stubs strict globals. See [[dropbox-sync-decisions]].

// Short synthesized cues via Web Audio. iOS hands the page a suspended context and takes the
// audio session back whenever the OS wants it — returning to the app, a call, another app's
// audio — leaving the context "suspended" or, in WebKit, "interrupted". A single unlock() from
// the first tap is not enough: re-arm on every tap and on every return to the app, the way
// clock.js re-requests the wake lock.
let ctx = null;

export function unlock() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = ctx || new AC();
  if (ctx.state !== "running") ctx.resume().catch(() => {});
}

// Re-arm audio for the life of a session. Returns a teardown.
export function keepAudioAlive() {
  const onTap = () => unlock();
  const onVisible = () => { if (document.visibilityState === "visible") unlock(); };
  document.addEventListener("pointerdown", onTap, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("pointerdown", onTap, { capture: true });
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function tone(freq, dur, delay = 0, gain = 0.25) {
  if (!ctx) return;
  // A stopped context has a frozen clock, so a tone scheduled now is not heard at all and then
  // fires with the whole backlog when the context comes back. Drop this cue, ask for the
  // context back for the next one.
  if (ctx.state !== "running") { unlock(); return; }
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export const cues = {
  tick:       () => { tone(880, 0.08); vibrate(30); },
  end:        () => { tone(1320, 0.35); vibrate([80, 40, 80]); },
  sideSwitch: () => { tone(1320, 0.12); tone(1320, 0.12, 0.18); vibrate([60, 60, 60]); },
  finish:     () => { tone(1046, 0.15); tone(1318, 0.15, 0.18); tone(1568, 0.3, 0.36); vibrate([80, 40, 80, 40, 160]); },
};

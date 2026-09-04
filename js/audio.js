// Short synthesized cues via Web Audio. iOS needs a user gesture first: call unlock() from a tap.
let ctx = null;

export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = ctx || new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

function tone(freq, dur, delay = 0, gain = 0.25) {
  if (!ctx) return;
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

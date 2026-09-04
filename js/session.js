// Pure session engine: turns a workout into phases and runs a timestamp-driven state machine.
// No DOM, no timers. The view calls tick(now) a few times a second and reacts to the events.
import { getExercise } from "./exercises.js";

export function buildPhases(workout, getEx = getExercise) {
  const steps = workout.steps.filter(s => getEx(s.exerciseId));
  const phases = [];
  steps.forEach((s, i) => {
    const ex = getEx(s.exerciseId);
    phases.push({ kind: "exercise", stepIndex: i, exerciseId: s.exerciseId, seconds: s.seconds, sided: !!ex.sided, exerciseNo: i + 1 });
    const last = i === steps.length - 1;
    if (!last && s.restSeconds > 0) {
      phases.push({ kind: "rest", stepIndex: i, seconds: s.restSeconds, afterExerciseId: s.exerciseId, nextExerciseId: steps[i + 1].exerciseId });
    }
  });
  return phases;
}

const BACK_WINDOW_MS = 2000;
const EPS = 1e-9;

export class Session {
  constructor(phases, now) {
    this.phases = phases;
    this.finished = phases.length === 0;
    this.totalSeconds = phases.reduce((a, p) => a + p.seconds, 0);
    this.lastBackAt = null;
    this._enter(0, now, false);
  }

  _enter(index, now, keepPaused) {
    this.index = index;
    this.startedAt = now;
    this.pausedTotal = 0;
    this.pausedAt = keepPaused ? now : null;
    this.sideSwitched = false;
    this.lastWhole = null;
  }

  get phase() { return this.phases[this.index]; }
  get paused() { return this.pausedAt != null; }
  get exerciseCount() { return this.phases.filter(p => p.kind === "exercise").length; }
  get exerciseNo() {
    let n = 0;
    for (let i = 0; i <= this.index && i < this.phases.length; i++) if (this.phases[i].kind === "exercise") n++;
    return n;
  }

  elapsed(now) {
    if (this.finished) return 0;
    const pausedNow = this.paused ? now - this.pausedAt : 0;
    return Math.max(0, (now - this.startedAt - this.pausedTotal - pausedNow) / 1000);
  }

  // Seconds left in the current phase, or in the current side for a sided phase.
  remaining(now) {
    if (this.finished) return 0;
    const p = this.phase;
    const e = this.elapsed(now);
    if (p.sided) {
      const half = p.seconds / 2;
      return Math.max(0, e < half ? half - e : p.seconds - e);
    }
    return Math.max(0, p.seconds - e);
  }

  remainingWhole(now) { return Math.ceil(this.remaining(now) - EPS); }

  side(now) {
    const p = this.phase;
    if (!p || !p.sided) return null;
    return this.elapsed(now) < p.seconds / 2 ? "left" : "right";
  }

  phaseProgress(now) { return this.finished ? 1 : Math.min(1, this.elapsed(now) / this.phase.seconds); }

  progress(now) {
    if (this.finished) return 1;
    let done = 0;
    for (let i = 0; i < this.index; i++) done += this.phases[i].seconds;
    done += Math.min(this.elapsed(now), this.phase.seconds);
    return this.totalSeconds ? done / this.totalSeconds : 1;
  }

  nextExercisePhase() {
    for (let i = this.index + 1; i < this.phases.length; i++) if (this.phases[i].kind === "exercise") return this.phases[i];
    return null;
  }

  restBeforeNext() {
    const n = this.phases[this.index + 1];
    return n && n.kind === "rest" ? n.seconds : 0;
  }

  pause(now) { if (!this.finished && !this.paused) this.pausedAt = now; }
  resume(now) { if (this.paused) { this.pausedTotal += now - this.pausedAt; this.pausedAt = null; } }
  toggle(now) { this.paused ? this.resume(now) : this.pause(now); }

  _setElapsed(now, seconds) {
    const keepPaused = this.paused;
    this.pausedTotal = 0;
    this.startedAt = now - seconds * 1000;
    this.pausedAt = keepPaused ? now : null;
  }

  _advance(now, overshootSeconds, events) {
    if (this.index + 1 >= this.phases.length) {
      this.finished = true;
      events.push({ type: "finished" });
      return;
    }
    const keepPaused = this.paused;
    this._enter(this.index + 1, now - overshootSeconds * 1000, keepPaused);
  }

  skip(now) {
    if (this.finished) return;
    const p = this.phase;
    if (p.sided && this.side(now) === "left") {
      this._setElapsed(now, p.seconds / 2);
      this.sideSwitched = true;
      this.lastWhole = null;
      return;
    }
    this._advance(now, 0, []);
  }

  back(now) {
    if (this.finished) return;
    const again = this.lastBackAt != null && now - this.lastBackAt < BACK_WINDOW_MS;
    this.lastBackAt = now;
    if (again) {
      for (let i = this.index - 1; i >= 0; i--) {
        if (this.phases[i].kind === "exercise") {
          this._enter(i, now, this.paused);
          this.lastBackAt = null;
          return;
        }
      }
    }
    this._enter(this.index, now, this.paused);
  }

  end() { this.finished = true; }

  tick(now) {
    const events = [];
    if (this.finished || this.paused) return events;
    const p = this.phase;
    if (p.sided && !this.sideSwitched && this.elapsed(now) >= p.seconds / 2) {
      this.sideSwitched = true;
      this.lastWhole = null;
      events.push({ type: "side-switch" });
    }
    let guard = 0;
    while (!this.finished && this.elapsed(now) >= this.phase.seconds && guard++ < 1000) {
      const overshoot = this.elapsed(now) - this.phase.seconds;
      events.push({ type: "phase-end" });
      this._advance(now, overshoot, events);
    }
    if (this.finished) return events;
    const whole = this.remainingWhole(now);
    if (whole !== this.lastWhole) {
      this.lastWhole = whole;
      if (whole >= 1 && whole <= 3) events.push({ type: "countdown", value: whole });
    }
    return events;
  }
}

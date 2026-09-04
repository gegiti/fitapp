import { el, confirmAsync, cap } from "../ui.js";
import { buildPhases, Session } from "../session.js";
import { getExercise, figureUrl } from "../exercises.js";
import { now, keepAwake, releaseAwake, reacquireOnVisible } from "../clock.js";
import { cues, unlock } from "../audio.js";

const GET_READY_S = 3;
const TICK_MS = 250;

export function render({ store, params, navigate }) {
  const w = store.state.workouts.find(x => x.id === params.id);
  const phases = w ? buildPhases(w) : [];
  if (!phases.length) { navigate("/train"); return { el: el("div"), tabs: "train" }; }

  const root = el("div", { class: "session" });
  const ui = {};
  let session = null;
  let readyUntil = now() + GET_READY_S * 1000;
  let lastReady = null;
  let stopped = false;

  build();
  keepAwake();
  const stopVis = reacquireOnVisible();
  const timer = setInterval(frame, TICK_MS);
  frame();

  return { el: root, tabs: null, destroy() { stopped = true; clearInterval(timer); stopVis(); releaseAwake(); } };

  function build() {
    ui.where = el("span", { class: "where" });
    ui.bar = el("div");
    ui.h1 = el("h1");
    ui.type = el("div", { class: "type" });
    ui.relaxed = el("img", { alt: "" });
    ui.flexed = el("img", { alt: "" });
    ui.timer = el("div", { class: "timer" });
    ui.phaseBar = el("div");
    ui.cue = el("div", { class: "cue" });
    ui.next = el("div", { class: "next" });
    ui.stage = el("div", { class: "stage", onClick: () => { if (session) { session.toggle(now()); frame(); } } },
      ui.relaxed,
      el("div", { style: { width: "100%" } }, ui.timer, el("div", { class: "bar big" }, ui.phaseBar)),
      ui.flexed,
      el("div", {}, ui.cue, ui.next));
    ui.pauseBtn = el("button", { class: "pause", onClick: () => { if (session) { session.toggle(now()); frame(); } } }, "▐▐  Pause");
    ui.overlay = el("div", { class: "overlay", hidden: true });
    root.replaceChildren(
      el("div", { class: "top" }, el("button", { class: "x", "aria-label": "End session", onClick: exit }, "✕"), ui.where),
      el("div", { class: "bar" }, ui.bar),
      ui.h1, ui.type, ui.stage,
      el("div", { class: "controls" },
        el("button", { class: "side", "aria-label": "Back", onClick: () => { if (session) { session.back(now()); frame(); } } }, "‹‹"),
        ui.pauseBtn,
        el("button", { class: "side", "aria-label": "Skip", onClick: () => { if (session) { session.skip(now()); frame(); } } }, "››")),
      ui.overlay);
  }

  async function exit() {
    if (session && !session.finished) {
      const remainingExercises = session.exerciseCount - session.exerciseNo + 1;
      const wasPaused = session.paused;
      if (!wasPaused) session.pause(now());
      if (remainingExercises > 1 && !(await confirmAsync("End session?"))) {
        if (!wasPaused) session.resume(now());
        frame();
        return;
      }
    }
    navigate("/train");
  }

  function frame() {
    if (stopped) return;
    const t = now();
    if (!session) {
      const left = Math.ceil((readyUntil - t) / 1000);
      if (left > 0) {
        if (left !== lastReady) { lastReady = left; cues.tick(); }
        showOverlay(String(left), "Get ready", w.name);
        return;
      }
      unlock();
      session = new Session(phases, t);
      hideOverlay();
    }
    for (const ev of session.tick(t)) {
      if (ev.type === "countdown") cues.tick();
      else if (ev.type === "phase-end") cues.end();
      else if (ev.type === "side-switch") { cues.sideSwitch(); flash(); }
      else if (ev.type === "finished") cues.finish();
    }
    if (session.finished) { stopped = true; navigate(`/train/done/${w.id}`); return; }
    paint(t);
  }

  function paint(t) {
    const p = session.phase;
    const ex = getExercise(p.kind === "exercise" ? p.exerciseId : p.nextExerciseId);
    const accent = p.kind === "rest" ? "var(--muted)" : `var(--${ex.type})`;
    root.classList.toggle("rest", p.kind === "rest");
    root.style.setProperty("--accent", accent);
    ui.where.textContent = `${w.name}  ${session.exerciseNo}/${session.exerciseCount}`;
    ui.bar.style.width = `${session.progress(t) * 100}%`;
    ui.phaseBar.style.width = `${(1 - session.phaseProgress(t)) * 100}%`;
    ui.timer.textContent = fmt(session.remainingWhole(t));
    ui.timer.classList.toggle("huge", p.kind === "rest");
    if (p.kind === "exercise") {
      const side = session.side(t);
      ui.h1.textContent = ex.name.toUpperCase();
      ui.type.textContent = cap(ex.type) + (side ? `  ·  ${cap(side)} side` : "");
      ui.type.className = `type ${ex.type}`;
      setSrc(ui.relaxed, figureUrl(ex.id, "relaxed"));
      ui.relaxed.hidden = false;
      setSrc(ui.flexed, figureUrl(ex.id, "flexed"));
      ui.cue.textContent = ex.cue;
      const nx = session.nextExercisePhase();
      const rest = session.restBeforeNext();
      ui.next.textContent = nx ? `Next: ${getExercise(nx.exerciseId).name} ${nx.seconds}s${rest ? ` (after ${rest}s rest)` : ""}` : "Last one";
      ui.next.className = "next";
    } else {
      const after = getExercise(p.afterExerciseId);
      ui.h1.textContent = "REST";
      ui.type.textContent = `${p.seconds}s · after ${after?.name ?? ""}`;
      ui.type.className = "type";
      ui.relaxed.hidden = true;
      setSrc(ui.flexed, figureUrl(ex.id, "flexed"));
      ui.cue.textContent = `${ex.name} · ${cap(ex.type)}`;
      ui.next.textContent = `Next: ${ex.name} ${session.nextExercisePhase()?.seconds ?? ""}s`;
      ui.next.className = "next big";
    }
    ui.pauseBtn.textContent = session.paused ? "▶  Resume" : "▐▐  Pause";
    if (session.paused) showOverlay("▐▐", "Paused", "tap anywhere to resume", () => { session.resume(now()); frame(); });
    else hideOverlay();
  }

  function showOverlay(big, title, sub, onTap) {
    ui.overlay.replaceChildren(el("div", { class: "big" }, big), el("div", { class: "title" }, title), el("div", { class: "sub" }, sub));
    ui.overlay.onclick = onTap || null;
    ui.overlay.hidden = false;
  }
  function hideOverlay() { ui.overlay.hidden = true; }
  function flash() { root.animate?.([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 300 }); }
  function setSrc(img, src) { if (img.getAttribute("src") !== src) img.src = src; }
}

const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Hash routing. Paths: /plan, /plan/workout/:id, /plan/bank, /plan/bank/pick/:workoutId,
// /train, /train/session/:id, /train/done/:id. Anything else falls back to /plan.
export function parseRoute(hash) {
  const parts = (hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, b, c, d] = parts;
  if (a === "plan" && b === "workout" && c) return { name: "workout", params: { id: c } };
  if (a === "plan" && b === "bank" && c === "pick" && d) return { name: "bank", params: { pick: d } };
  if (a === "plan" && b === "bank") return { name: "bank", params: {} };
  if (a === "train" && b === "session" && c) return { name: "session", params: { id: c } };
  if (a === "train" && b === "done" && c) return { name: "done", params: { id: c } };
  if (a === "train") return { name: "train", params: {} };
  return { name: "plan", params: {} };
}

export function navigate(path) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (location.hash === target) dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = target;
}

export function startRouter(onChange) {
  const fire = () => onChange(parseRoute(location.hash));
  addEventListener("hashchange", fire);
  fire();
}

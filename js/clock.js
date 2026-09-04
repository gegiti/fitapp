// Wall clock and screen wake lock.
export const now = () => Date.now();

let lock = null;
export async function keepAwake() {
  try { lock = await navigator.wakeLock?.request("screen"); } catch { lock = null; }
}
export function releaseAwake() {
  lock?.release().catch(() => {});
  lock = null;
}
// The lock is dropped by the OS when the page is hidden; re-request when it comes back.
export function reacquireOnVisible() {
  const h = () => { if (document.visibilityState === "visible") keepAwake(); };
  document.addEventListener("visibilitychange", h);
  return () => document.removeEventListener("visibilitychange", h);
}

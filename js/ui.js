// Minimal DOM helpers. el() builds elements; sheet() shows a bottom sheet; toast() a transient message.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "value") node.value = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

// Replace a node's children, skipping null/false entries (unlike the DOM's replaceChildren).
export function replace(node, ...children) {
  node.replaceChildren(...children.flat().filter(c => c != null && c !== false));
}

// One sheet at a time. Opening a new one closes the current one; route changes close all.
const openSheets = new Set();
export function sheet(content, { onClose } = {}) {
  closeSheets();
  const backdrop = el("div", { class: "sheet-backdrop" });
  const panel = el("div", { class: "sheet" }, el("div", { class: "grip" }), content);
  let closed = false;
  const close = () => { if (closed) return; closed = true; openSheets.delete(close); backdrop.remove(); panel.remove(); onClose?.(); };
  openSheets.add(close);
  backdrop.addEventListener("click", close);
  document.body.append(backdrop, panel);
  return close;
}
export function closeSheets() { for (const close of [...openSheets]) close(); }

let toastTimer;
export function toast(text, ms = 2500) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

export async function confirmAsync(text) {
  return window.confirm(text);
}

export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

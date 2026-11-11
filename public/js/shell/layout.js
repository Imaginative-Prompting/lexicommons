// How the app's tabs are laid out, kept on this device: Home, Study and Explore, and AI as a third once one is connected (/api/me's aiConnected, the last answer kept on
// this device so the first draw is right) if Settings → Appearance → Text and layout's switch puts it there. Read has no tab for now: it's Home's book card,
// as AI is when it has none.

const KEY = "lx.shell.v1";
const listeners = new Set();
const ME = "lx.me.v1"; // shell/api.js keeps its last /api/me here

function keptConnected() {
  try {
    return JSON.parse(localStorage.getItem(ME) ?? "null")?.me?.aiConnected === true;
  } catch {
    return false;
  }
}
let connected = keptConnected();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return { third: saved?.third === "ai" ? "ai" : "none" };
  } catch {
    return { third: "none" };
  }
}
let layout = load();

/** Which page has a third tab: AI, once one is connected and its setting gives it the tab; else none (null). */
export const thirdTab = () => (connected && layout.third === "ai" ? "ai" : null);
export const THIRD_TABS = { ai: { label: "AI", icon: "chat" } };
/** "ai" puts AI in the tab bar; "none" leaves it a row on Home. */
export function setThirdTab(value) {
  if (!(value in THIRD_TABS || value === "none") || value === layout.third) return;
  layout = { ...layout, third: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Private browsing: it lasts for this visit.
  }
  for (const fn of listeners) fn(layout);
}
/** Whether an AI is connected, as far as this device knows. */
export const aiConnected = () => connected;

/** The server's answer (/api/me): a change redraws the tabs and whatever follows this (onLayoutChange). */
export function setAiConnected(value) {
  if (Boolean(value) === connected) return;
  connected = Boolean(value);
  for (const fn of listeners) fn(layout);
}

/** Calls fn when the layout changes (here or in another tab). Returns a function to stop. */
export function onLayoutChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

globalThis.addEventListener?.("storage", (event) => {
  if (event.key !== KEY) return;
  layout = load();
  for (const fn of listeners) fn(layout);
});

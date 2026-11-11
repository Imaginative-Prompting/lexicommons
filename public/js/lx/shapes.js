// How tall a slot on a page was when it was last drawn, kept on this device (localStorage "lx.shapes.v1"). A page drawn
// before its data is in holds the slot's place with a skeleton that tall (heldPlace), so nothing moves when the data
// comes; and a slot that was empty last time holds nothing. Only heights: never what was in the slot.

import { skeleton } from "./ui.js";

const KEY = "lx.shapes.v1";
let shapes = null;

function load() {
  if (shapes) return shapes;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    shapes = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    shapes = {};
  }
  return shapes;
}

/** The slot's height when it was last drawn (px), or null when it was empty or never drawn on this device. */
export function heldHeight(name) {
  const height = load()[name];
  return typeof height === "number" && height > 0 && height < 4000 ? height : null;
}

/** [a skeleton as tall as the slot was last time], or [] when it held nothing: a slot's first children. */
export const heldPlace = (name) => {
  const height = heldHeight(name);
  return height ? [skeleton({ height })] : [];
};

/** Keeps how tall `node` is now as its slot's height (0 when it's empty; nothing when it isn't laid out). */
export function keepHeight(name, node) {
  if (!node?.isConnected || node.closest("[hidden]")) return;
  const height = Math.round(node.getBoundingClientRect().height);
  if (load()[name] === height) return;
  shapes[name] = height;
  try {
    localStorage.setItem(KEY, JSON.stringify(shapes));
  } catch {}
}

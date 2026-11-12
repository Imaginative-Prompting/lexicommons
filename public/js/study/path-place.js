// Where you've put yourself on a language's path, and the lessons you've marked as done when you jumped past them: the only things about the path
// that are stored (what you've learned comes from the evidence). Kept on this device and synced through your own storage (kind "path"), newest wins.

import { registerSync } from "../sync.js";
import { sampleKey } from "./sample-mode.js";

// The sample learner's own while it's on (sample-mode.js): never yours.
const KEY = sampleKey("lx.path.v1");
const listeners = new Set();
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}
let places = load();
let applying = false;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    // Private browsing: it lasts for this visit.
  }
  for (const fn of listeners) fn();
}

/** The lesson you've put yourself at, in a language, or null: you're where your learning has got to. */
export const placeOn = (lang) => places[lang]?.lesson ?? null;

/** When you put yourself there. */
export const placeAt = (lang) => places[lang]?.at ?? 0;

/** Puts you at a lesson. null: back to where your learning has got to. */
export function setPlace(lang, lesson) {
  places[lang] = { ...places[lang], at: Date.now(), lesson };
  save();
}

/** The lessons you've marked as done, in a language. */
export const markedOn = (lang) => places[lang]?.marked ?? [];

/** Marks lessons as done. */
export function addMarked(lang, lessons) {
  places[lang] = { lesson: null, ...places[lang], at: Date.now(), marked: [...new Set([...markedOn(lang), ...lessons])] };
  save();
}

/**
 * A placement in a language (study/placement.js), or null: { placed, taken, asked }. placed: where it put you, or null (from the beginning, or
 * put back there): { unit (its id; null past the whole course), n (its number), at, lessons (the written lessons before it: done without being
 * taken, plan.js), missed (words it asked in those units and you missed: taught as new) }. taken: when one was last finished (Study offers
 * it only before). asked: its sentence ids and words, so the next draws others.
 */
export const placementOn = (lang) => places[lang]?.placement ?? null;

/** Keeps a placement (placementOn's shape), and with `lesson` puts you there (null: where your learning has got to). */
export function setPlacement(lang, placement, { lesson } = {}) {
  places[lang] = { lesson: null, ...places[lang], at: Date.now(), placement, ...(lesson !== undefined ? { lesson } : {}) };
  save();
}

/** A language's place as it is now (your place and its placement), for putting back (restorePlace). */
export const placeSnapshot = (lang) => JSON.parse(JSON.stringify({ lesson: places[lang]?.lesson ?? null, placement: places[lang]?.placement ?? null }));

/** Puts back a language's place and placement as placeSnapshot had them: an Undo. The rest of what's kept (marks, anchors) stays as it is now. */
export function restorePlace(lang, snapshot) {
  places[lang] = { ...places[lang], at: Date.now(), lesson: snapshot?.lesson ?? null, placement: snapshot?.placement ?? null };
  save();
}

/**
 * Where a pack you added goes on the path: the unit it comes after (path.js), set once, the first time the path is laid out with it, so it
 * stays put as you go on. undefined: not placed yet; null: after the language's own path.
 */
export const anchorOf = (lang, pack) => (Object.hasOwn(places[lang]?.anchors ?? {}, pack) ? places[lang].anchors[pack] : undefined);

/** Where every pack you added sits, in a language: { <pack>: <unit> } (a key for what's kept of the path, study/plan-kept.js). */
export const anchorsOn = (lang) => ({ ...places[lang]?.anchors });

/** Places a pack you added after a unit (or null: after the language's own path). */
export function setAnchor(lang, pack, unit) {
  places[lang] = { lesson: null, ...places[lang], at: Date.now(), anchors: { ...places[lang]?.anchors, [pack]: unit } };
  save();
}

/** Places several (a pack, or "lesson:<id>" for a lesson of one idea new to the path, path.js) at once: one save. */
export function setAnchors(lang, entries) {
  if (!entries.length) return;
  places[lang] = { lesson: null, ...places[lang], at: Date.now(), anchors: { ...places[lang]?.anchors, ...Object.fromEntries(entries) } };
  save();
}

/**
 * The written lessons of a language's path laid out on this device (or another of yours), by id: a lesson of one idea that isn't among them
 * is new to the path, put in since (path.js puts it ahead of you when you'd gone past where it goes). undefined: never laid out here.
 */
export const seenOn = (lang) => places[lang]?.seen;

/** Notes lessons as laid out, joined to those noted before. Quietly: it changes nothing on a screen (it goes with the next sync of the place). */
export function addSeen(lang, ids) {
  const was = places[lang]?.seen;
  const known = new Set(was ?? []);
  const more = ids.filter((id) => !known.has(id));
  if (was && !more.length) return;
  places[lang] = { lesson: null, at: places[lang]?.at ?? 0, ...places[lang], seen: [...known, ...more] };
  try {
    localStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    // Private browsing: it lasts for this visit.
  }
}

/** Forgets every place and mark (a test's fresh start). */
export function clearPlaces() {
  places = {};
  save();
}

export const onPlaceChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// A placement as another device sent it, taken only in its own shape (anything else: none). Its lists are of ids and words, held to their sizes.
const strings = (list, most) => (Array.isArray(list) ? list.filter((one) => typeof one === "string" && one.length <= 200).slice(0, most) : []);
function placementFrom(value) {
  if (!value || typeof value !== "object") return null;
  const placed = value.placed;
  const okPlaced =
    placed === null ||
    (placed && typeof placed === "object" && (placed.unit === null || typeof placed.unit === "string") && Number.isInteger(placed.n) && placed.n >= 2 && Number.isFinite(placed.at));
  if (!okPlaced) return null;
  return {
    placed: placed && { unit: placed.unit, n: placed.n, at: placed.at, lessons: strings(placed.lessons, 1000), missed: strings(placed.missed, 400) },
    taken: Number.isFinite(value.taken) ? value.taken : 0,
    asked: strings(value.asked, 200),
  };
}

/** Its sync kind (sync.js), exported so a test can apply a record as another device would send it. */
export const pathSync = {
  id: "path",
  label: "Where you are on the path",
  icon: "target",
  counted: (n) => `${n.toLocaleString()} ${n === 1 ? "language" : "languages"}`,
  records() {
    return Object.fromEntries(Object.entries(places).map(([lang, p]) => [lang, { at: p.at, value: { lesson: p.lesson, ...(p.marked?.length ? { marked: p.marked } : {}), ...(p.anchors ? { anchors: p.anchors } : {}), ...(p.seen?.length ? { seen: p.seen } : {}), ...(p.placement ? { placement: p.placement } : {}) } }]));
  },
  check: (record, key) => typeof key === "string" && /^[a-zA-Z-]{2,16}$/.test(key) && Number.isFinite(record?.at) && (record?.value?.lesson === null || typeof record?.value?.lesson === "string"),
  apply(newer) {
    for (const [lang, record] of Object.entries(newer)) {
      // A pack's place is set once: the newer record's places join this device's, and one placed here first stays where it was.
      const theirs = record.value.anchors && typeof record.value.anchors === "object" ? Object.fromEntries(Object.entries(record.value.anchors).filter(([, unit]) => unit === null || typeof unit === "string")) : {};
      const anchors = { ...theirs, ...places[lang]?.anchors };
      // The lessons laid out: every device's together (a lesson new to one is new to all until laid out somewhere).
      const seen = [...new Set([...(places[lang]?.seen ?? []), ...(Array.isArray(record.value.seen) ? record.value.seen.filter((id) => typeof id === "string") : [])])];
      // A record from a device that keeps no placement (one from before them) says nothing of it: this device's stays. Taking one back is placed: null.
      const placement = record.value.placement === undefined ? (places[lang]?.placement ?? null) : placementFrom(record.value.placement);
      places[lang] = { at: record.at, lesson: record.value.lesson, ...(Array.isArray(record.value.marked) ? { marked: record.value.marked.filter((id) => typeof id === "string") } : {}), ...(Object.keys(anchors).length ? { anchors } : {}), ...(seen.length ? { seen } : {}), ...(placement ? { placement } : {}) };
    }
    applying = true;
    try {
      save();
    } finally {
      applying = false;
    }
    return [];
  },
  onChange: (fn) => onPlaceChange(() => applying || fn()),
};
registerSync(pathSync);

// Lexicommons theme engine. A person's appearance is a built-in theme, plus token overrides, custom CSS and images
// (together, their "look"), plus their own layout presets. A look that changes anything is a theme of their own, kept
// with a name in their library of themes, so switching to a built-in theme or another of theirs never loses one: every
// change to the look in use is written to its theme, and changing a built-in theme starts a new theme of theirs (the
// built-in ones never change). All of it stays on the device: settings in localStorage, images, recent looks and the
// library in IndexedDB (look-sync.js keeps the library and the look in use in step with the account). A theme shares as
// one JSON file (format "lexicommons-theme"); a shared file never carries anyone's presets, because text size and
// density are personal.
//
// How it's applied:
// - the base theme and presets are data attributes on <html> (tokens.css and presets.css key on them);
// - token overrides and custom CSS are two constructable stylesheets in document.adoptedStyleSheets, so the page's
//   CSP (style-src 'self') stays strict. They're unlayered and the app's CSS is in layers (tokens.css), so a
//   person's CSS always wins, however plain its selectors;
// - images are stored by the SHA-256 of their bytes and become blob: URLs in --image-<slot> tokens.
// theme-boot.js applies the saved attributes and stylesheets before first paint; this module takes over from it.
//
// Safety: every look goes through look-rules.js (and so css-safety.js) before it's saved or applied, and the CSP is
// the backstop: images and fonts can only come from this site, data: or blob:, so a theme can't reach another server.
// Recent looks keep the last 20 looks you replaced, so any change can be undone, and a page can register a usability
// check: a look that fails it (it hid the header, say) is undone at once. /app/?safe opens with the look turned off.

import { THEMING_SURFACE_VERSION } from "./parts.js";
import * as rules from "./look-rules.js";
import * as motion from "./motion.js";
import { readyTheme, readyTokens } from "./theme-presets.js";
import { themeLabel } from "./theme-names.js";

export { meaningTokens, IMAGE_SLOTS, SECTIONS, SECTION_FALLBACK, BACKGROUND_SETTINGS, TOKEN_GUIDE, COLOUR_GROUPS, describeLook, BUILT_IN_THEMES, builtInName, hasChanges } from "./look-rules.js";

export const STORAGE_KEY = "lx.appearance.v1";
export const THEME_FILE_FORMAT = "lexicommons-theme";
export const THEME_FILE_VERSION = 1;

export const LIMITS = { ...rules.LOOK_LIMITS, themeFileBytes: 24_000_000, historyCount: 20, historyImageBytes: 64_000_000 };

const BUILT_IN_THEMES = rules.BUILT_IN_THEMES;

/** Layout presets: personal settings, each a data-<name> attribute on <html>. Its default is `default`, else its first option. */
export const PRESETS = {
  density: { label: "Density", options: [["comfortable", "Comfortable"], ["compact", "Compact"], ["spacious", "Spacious"]] },
  text: { label: "Text size", default: "m", options: [["s", "S"], ["m", "M"], ["l", "L"], ["xl", "XL"]] },
  card: { label: "Cards", options: [["filled", "Filled"], ["outlined", "Outlined"], ["flat", "Flat"]] },
  reader: { label: "Reader", options: [["pages", "Pages"], ["scroll", "Scroll"]] },
  motion: { label: "Animations", options: [["system", "Match device"], ["on", "On"], ["off", "Off"]] },
  art: { label: "Drawings", options: [["color", "In color"], ["theme", "In the theme's ink"]] },
};

/** Photos bigger than this (either side) are scaled down when they're added, and so are files over the size limit. */
const IMAGE_MAX_SIDE = 2560;
// iPhones can hand over HEIC; it's converted on the way in (only where the browser can decode it).
const CONVERTIBLE = ["image/heic", "image/heif"];
const SCALABLE = ["image/png", "image/jpeg", "image/webp", "image/avif", ...CONVERTIBLE];

/** True on /app/?safe (or any page opened with ?safe): the look is kept but not applied, so a broken one can be fixed. */
export const SAFE_MODE = typeof location !== "undefined" && new URLSearchParams(location.search).has("safe");

export class ThemeError extends Error {}

const toThemeError = (error) => (error instanceof rules.LookError ? new ThemeError(error.message) : error);

// ---------- settings ----------

// One-time moves of saved settings. Each runs once: its name is kept in `moves`, so a later choice sticks.
//   reader-pages  Pages became the Reader default; a "scroll" saved before then was the old default, not a choice.
const MOVES = ["reader-pages"];
// A move ran on the last read and hasn't been saved yet.
let movesPending = false;

function defaults() {
  return {
    version: 1,
    theme: "graphite",
    presets: Object.fromEntries(Object.entries(PRESETS).map(([name, preset]) => [name, preset.default ?? preset.options[0][0]])),
    look: { theme: null, name: "", tokens: {}, css: "", images: {} },
    moves: [...MOVES],
  };
}

/** Fills in anything missing or unknown, so a damaged or older saved value still gives a working appearance. */
function normalize(saved) {
  movesPending = false;
  const base = defaults();
  if (!saved || saved.version !== 1) return base;
  // A built-in theme or a ready-made one (lx/theme-presets.js).
  if (rules.BASE_THEMES.includes(saved.theme)) base.theme = saved.theme;
  // "reduced" was the old name for animations off.
  if (saved.presets?.motion === "reduced") saved.presets.motion = "off";
  for (const [name, preset] of Object.entries(PRESETS)) {
    const value = saved.presets?.[name];
    if (preset.options.some(([id]) => id === value)) base.presets[name] = value;
  }
  const done = new Set(Array.isArray(saved.moves) ? saved.moves : []);
  if (!done.has("reader-pages") && base.presets.reader === "scroll") base.presets.reader = "pages";
  movesPending = MOVES.some((move) => !done.has(move));
  // Checked again on load, so a stricter check in a newer version also covers a look saved before it.
  const look = saved.look ?? {};
  let checked;
  try {
    checked = rules.checkLook({ ...look, base: base.theme }).look;
  } catch {
    checked = rules.checkLook({ ...look, css: "", base: base.theme }).look;
  }
  base.look = { theme: checked.theme, name: checked.name, tokens: checked.tokens, css: checked.css, images: checked.images };
  // Images saved before they were stored by hash: kept until initTheme moves them (migrateImages).
  for (const [slot, meta] of Object.entries(look.images ?? {})) {
    if (!base.look.images[slot] && rules.SLOT_NAME.test(slot) && meta && !meta.hash && rules.IMAGE_TYPES.includes(meta.type)) {
      base.look.images[slot] = { legacy: true, type: meta.type, size: Number(meta.size) || 0, name: String(meta.name ?? "").slice(0, 120) };
    }
  }
  return base;
}

let settings = defaults();
let persisted = true;
const listeners = new Set();
const usabilityChecks = new Set();

function read() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    persisted = false;
    return defaults();
  }
}

/** Saves the settings on this device (write() also writes the theme in use through to its entry). */
function save() {
  try {
    // A ready-made theme's tokens go with it, for theme-boot.js to put on before the first paint (it can't work them out).
    const ready = readyTheme(settings.theme);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ready ? { ...settings, ready: { id: ready.id, base: ready.base, tokens: readyTokens(ready.id) } } : settings));
    persisted = true;
  } catch {
    // Private browsing or a full disk: the appearance still applies for this visit.
    persisted = false;
  }
}

function write() {
  save();
  writeThrough();
}

export function getSettings() {
  return structuredClone(settings);
}

/** The current look in the shape recent looks and your AI use: { theme, name, base, tokens, css, images }. */
export function currentLook() {
  const { theme, name, tokens, css, images } = settings.look;
  return structuredClone({ theme: theme ?? null, name, base: settings.theme, tokens, css, images });
}

/** The theme in use: { kind: "yours", id, name } or { kind: "built-in", id, name }. */
export function themeInUse() {
  const { theme, name } = settings.look;
  return theme ? { kind: "yours", id: theme, name: name || "Untitled theme" } : { kind: "built-in", id: settings.theme, name: rules.builtInName(settings.theme) };
}

/** False when the browser won't let the page save (private browsing): changes last only for this visit. */
export function isPersisted() {
  return persisted;
}

/**
 * listener(settings, change): change = { kind, undo?, reason?, label?, started? }. kind is theme · preset · tokens · css
 * · image · name · reset · import · restore · switch · remote · reverted · other-tab, or library (a theme was added,
 * renamed, deleted or brought back on this device) · library-sync (look-sync took in the account's themes). undo is the
 * recent look to go back to (restoreLook(undo)); a remote change's label says where it came from, a switch's which
 * theme. started is the name of a theme of yours that a change to a built-in theme started.
 */
export function onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Registers a check that the page is still usable under a new look: fn() returns null, or why it isn't ("hid the
 * header"). A look that makes a passing check fail is undone at once, and the change that brought it throws a
 * ThemeError saying why.
 */
export function addUsabilityCheck(fn) {
  usabilityChecks.add(fn);
  return () => usabilityChecks.delete(fn);
}

function notify(change) {
  const snapshot = getSettings();
  for (const listener of listeners) listener(snapshot, change);
}

function commit(change) {
  write();
  apply();
  notify(change);
}

// ---------- applying ----------

const sheets = (globalThis.lxThemeSheets ??= { tokens: new CSSStyleSheet(), css: new CSSStyleSheet() });
// A ready-made theme's own tokens, under the look's (so a theme of yours made from one wins where it changes something). Made only where there
// are stylesheets: a test in Node that imports this module stands the sheets in (test-sync's pack inbox: globalThis.lxThemeSheets = {}).
if (typeof CSSStyleSheet === "function") sheets.ready ??= new CSSStyleSheet();
const blobUrls = new Map(); // hash -> blob: URL

/** The token stylesheet. Unlayered, so it outranks every built-in theme rule; custom CSS comes after it and wins. */
export function tokenSheetText(tokens, images = {}) {
  const lines = Object.entries(tokens).map(([name, value]) => `  ${name}: ${value};`);
  for (const [slot, url] of Object.entries(images)) lines.push(`  --image-${slot}: url("${url}");`);
  return lines.length ? `:root {\n${lines.join("\n")}\n}\n` : "";
}

// --image-background and a section's (--image-background-<section>); never one of their settings (-size, -repeat, -position, -dim, -blur).
const PICTURE_TOKEN = /^--image-background(?:-[a-z]+)?$/;
const PICTURE_SETTING = /-(?:size|repeat|position|dim|blur)$/;
function hasPicture(tokens = {}, urls = {}) {
  const slot = Object.keys(urls).some((name) => /^background(?:-[a-z]+)?$/.test(name) && !PICTURE_SETTING.test(name));
  const token = Object.entries(tokens ?? {}).some(([name, value]) => PICTURE_TOKEN.test(name) && !PICTURE_SETTING.test(name) && !/^\s*(none)?\s*$/.test(String(value)));
  return slot || token;
}

function slotUrls() {
  const out = {};
  for (const [slot, meta] of Object.entries(settings.look.images)) {
    const url = meta.hash ? blobUrls.get(meta.hash) : null;
    if (url) out[slot] = url;
  }
  return out;
}

/**
 * A motif theme's scene (its picture: url("/themes/…")) held unseen until it has decoded, then let go so it fades in (components.css
 * data-scene-waiting; its box is held all along). Shared with theme-boot.js, which holds it before the first paint: a picture decoded there
 * isn't held again (it would blink out). A theme changed meanwhile lets only its own go; one that fails to load lets go too, leaving the canvas.
 */
function holdPicture(root, value) {
  const url = /^url\("(\/themes\/[^"]+)"\)$/.exec(String(value ?? ""))?.[1] ?? null;
  const shown = (globalThis.__lxPicturesShown ??= new Set());
  globalThis.__lxPictureHeld = url;
  if (!url || shown.has(url)) return root.removeAttribute("data-scene-waiting");
  root.setAttribute("data-scene-waiting", "");
  const img = new Image();
  img.src = url;
  const letGo = (decoded) => () => {
    if (decoded) shown.add(url);
    if (globalThis.__lxPictureHeld === url) root.removeAttribute("data-scene-waiting");
  };
  (typeof img.decode === "function" ? img.decode() : Promise.reject()).then(letGo(true), letGo(false));
}

function apply() {
  const root = document.documentElement;
  // A ready-made theme sits on its base's rules (Graphite or Paper), its own tokens over them; data-ready names it.
  const ready = SAFE_MODE ? null : readyTheme(settings.theme);
  root.setAttribute("data-theme", ready ? ready.base : settings.theme);
  if (ready) root.setAttribute("data-ready", ready.id);
  else root.removeAttribute("data-ready");
  const readyOwn = ready ? readyTokens(ready.id) : {};
  for (const [name, value] of Object.entries(settings.presets)) root.setAttribute(`data-${name}`, value);
  root.toggleAttribute("data-safe-mode", SAFE_MODE);
  const urls = SAFE_MODE ? {} : slotUrls();
  root.toggleAttribute("data-has-mark", Boolean(urls.mark));
  // A background picture (a slot's image or a token of the look's own); the header's band is solid over it like any other (shell.css).
  root.toggleAttribute("data-has-picture", !SAFE_MODE && (hasPicture(settings.look.tokens, urls) || hasPicture(readyOwn)));
  holdPicture(root, readyOwn["--scene"]);
  sheets.ready.replaceSync(ready ? tokenSheetText(readyOwn) : "");
  sheets.tokens.replaceSync(SAFE_MODE ? "" : tokenSheetText(settings.look.tokens, urls));
  sheets.css.replaceSync(SAFE_MODE ? "" : settings.look.css);
  const others = document.adoptedStyleSheets.filter((s) => s !== sheets.ready && s !== sheets.tokens && s !== sheets.css);
  document.adoptedStyleSheets = [...others, sheets.ready, sheets.tokens, sheets.css];
}

/**
 * Makes sure every image the look uses has a blob: URL. One this device doesn't have yet (a theme whose images
 * look-sync is still fetching) stays in the look and shows once it's here: dropping it would drop it from the theme.
 */
async function loadImages() {
  const wanted = new Set(Object.values(settings.look.images).map((meta) => meta.hash).filter(Boolean));
  for (const [hash, url] of blobUrls) {
    if (!wanted.has(hash)) {
      URL.revokeObjectURL(url);
      blobUrls.delete(hash);
    }
  }
  for (const [slot, meta] of Object.entries(settings.look.images)) {
    if (!meta.hash || blobUrls.has(meta.hash)) continue;
    const blob = await store.getBlob(meta.hash);
    if (blob) blobUrls.set(meta.hash, URL.createObjectURL(blob));
  }
}

/** A blob: URL for any image this device has, by hash (theme previews use it), or null. */
export async function imageUrl(hash) {
  if (blobUrls.has(hash)) return blobUrls.get(hash);
  if (previewUrls.has(hash)) return previewUrls.get(hash);
  const blob = await store.getBlob(hash).catch(() => null);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  previewUrls.set(hash, url);
  return url;
}
const previewUrls = new Map(); // hash -> blob: URL, for images of themes not in use

/** Images saved before images were stored by hash move to the new store, once. */
async function migrateImages() {
  const legacy = Object.entries(settings.look.images).filter(([, meta]) => meta.legacy);
  if (!legacy.length) return;
  for (const [slot, meta] of legacy) {
    const blob = await store.getLegacy(slot);
    if (!blob) {
      delete settings.look.images[slot];
      continue;
    }
    const hash = await sha256(blob);
    await store.putBlob(hash, blob);
    settings.look.images[slot] = { hash, type: blob.type || meta.type, size: blob.size, name: meta.name };
  }
  await store.clearLegacy();
  write();
}

/** Reads the saved appearance and applies it, images included. Call once per page. */
export async function initTheme() {
  settings = read();
  // Saved now (on this device only: the themes aren't loaded yet), so the next page's first paint has it too.
  if (movesPending) save();
  apply();
  try {
    await migrateImages();
    await loadImages();
  } catch {
    // IndexedDB unavailable: the look applies without its images.
    for (const [slot, meta] of Object.entries(settings.look.images)) if (meta.legacy) delete settings.look.images[slot];
  }
  apply();
  await loadLibrary();
  adoptOrphanLook();
  // Another tab changed the appearance: follow it.
  addEventListener("storage", async (event) => {
    if (event.key !== STORAGE_KEY) return;
    settings = read();
    try {
      await loadImages();
    } catch {}
    apply();
    notify({ kind: "other-tab" });
  });
  return getSettings();
}

// ---------- sections ----------

// What the page's background layer (body::before) draws, as computed: enough to draw it again on the fade.
const BACKDROP = ["background-image", "background-position", "background-size", "background-repeat", "filter", "top", "right", "bottom", "left"];
function backdrop() {
  const style = getComputedStyle(document.body, "::before");
  return Object.fromEntries(BACKDROP.map((name) => [name, style.getPropertyValue(name)]));
}

/** The section the page shows (data-section on <html>), or null. */
export const currentSection = () => document.documentElement.getAttribute("data-section");

/**
 * Marks the section the page shows (one of SECTIONS, as data-section on <html>), so the look's background for that
 * section shows behind it (base.css). When that changes the background, the old one fades out over the new one: decoration
 * only (the pointer passes through it, a press finishes it, and with animations off there's none). The first section
 * a page gets doesn't fade.
 */
export function setSection(name) {
  const root = document.documentElement;
  const next = name in rules.SECTIONS ? name : null;
  const previous = currentSection();
  if (previous === next) return;
  const before = previous && document.body && motion.motionOn() ? backdrop() : null;
  if (next) root.setAttribute("data-section", next);
  else root.removeAttribute("data-section");
  if (!before) return;
  const after = backdrop();
  if (BACKDROP.every((name) => before[name] === after[name])) return;
  const fade = document.createElement("div");
  fade.className = "lx-backdrop-fade";
  fade.setAttribute("aria-hidden", "true");
  for (const [property, value] of Object.entries(before)) fade.style.setProperty(property, value);
  document.body.prepend(fade);
  const animation = motion.animate(fade, [{ opacity: 1 }, { opacity: 0 }], { duration: motion.duration("--dur-320", 320), fill: "forwards", onEnd: () => fade.remove() });
  if (!animation) fade.remove();
}

// ---------- recent looks ----------

// Small edits (colors, the theme, the name) made close together share one recent look, so dragging a color picker
// doesn't fill the list.
const COALESCE_MS = 60_000;
let lastSmall = null; // { id, at }

/**
 * Keeps the look about to be replaced as a recent look. Returns { id, saved }: the id at once (so small edits stay
 * synchronous), and a promise for when it's stored (big changes wait for it, so the images it uses are kept). Small
 * edits within a minute of each other share the first one's recent look.
 */
function takeSnapshot(kind, { label = "", coalesce = false } = {}) {
  if (coalesce && lastSmall && Date.now() - lastSmall.at < COALESCE_MS) return { id: lastSmall.id, saved: Promise.resolve() };
  const look = currentLook();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const at = Date.now();
  lastSmall = coalesce ? { id, at } : null;
  const saved = (async () => {
    // The same look twice in a row is kept once, under the newer id (the one the caller holds).
    const [latest] = await store.history();
    if (latest && rules.sameLook(latest.look, look)) await store.deleteHistory(latest.id);
    await store.putHistory({ id, at, kind, label, look });
    await pruneHistory();
  })().catch(() => {
    // No IndexedDB: changes still work, they just can't be undone.
  });
  return { id, saved };
}

async function pruneHistory() {
  const entries = await store.history();
  const keep = [];
  let bytes = 0;
  for (const entry of entries) {
    const size = Object.values(entry.look.images ?? {}).reduce((sum, meta) => sum + (meta.size || 0), 0);
    if (keep.length >= LIMITS.historyCount || bytes + size > LIMITS.historyImageBytes) await store.deleteHistory(entry.id);
    else {
      keep.push(entry);
      bytes += size;
    }
  }
  await collectImages(keep);
}

// Images stored in the last two minutes, which the look that will use them may not reference yet (a new image is
// stored before the look changes): never collected until then.
const FRESH_BLOB_MS = 120_000;
const freshBlobs = new Map(); // hash -> when it was stored

/** Deletes stored images that neither the current look, any recent look, any theme, nor a change in progress uses. */
async function collectImages(entries) {
  const used = new Set(Object.values(settings.look.images).map((meta) => meta.hash));
  for (const entry of entries ?? (await store.history())) for (const meta of Object.values(entry.look.images ?? {})) used.add(meta.hash);
  for (const entry of library.values()) for (const look of [entry.look, entry.synced]) for (const meta of Object.values(look?.images ?? {})) used.add(meta.hash);
  const now = Date.now();
  for (const [hash, at] of freshBlobs) if (now - at > FRESH_BLOB_MS) freshBlobs.delete(hash);
  for (const hash of await store.blobKeys()) if (!used.has(hash) && !freshBlobs.has(hash)) await store.deleteBlob(hash);
}

/** Recent looks, newest first: [{ id, at, kind, label, look }]. Empty when this browser can't store them. */
export async function getHistory() {
  try {
    return await store.history();
  } catch {
    return [];
  }
}

/** Goes back to a recent look. The look it replaces becomes a recent look itself, so a restore can be undone too. */
export async function restoreLook(id) {
  const entry = await store.getHistory(id).catch(() => null);
  if (!entry) throw new ThemeError("That look is no longer kept on this device");
  return replaceLook(entry.look, { kind: "restore", label: entry.label });
}

/**
 * Replaces the whole look (theme, tokens, CSS, images). images: { slot: Blob } for images not yet stored. Guarded:
 * if the page fails its usability check under the new look, the old one comes straight back and this throws.
 */
async function replaceLook(look, { kind, label, started }) {
  const checked = rules.checkLook(look).look;
  const snap = takeSnapshot(kind, { label });
  await snap.saved;
  const undo = snap.id;
  const before = getSettings();
  settings.theme = checked.base;
  settings.look = { theme: checked.theme, name: checked.name, tokens: checked.tokens, css: checked.css, images: checked.images };
  await loadImages().catch(() => {});
  guardedCommit({ kind, undo, label, ...(started ? { started } : {}) }, before);
  collectImages().catch(() => {});
  return undo;
}

/**
 * A look from elsewhere (your AI, or another of your devices, through look-sync.js) replaces the current one. Its
 * images must be stored first (storeImage); any that aren't are left out. Guarded like any whole-look change, so a
 * look that breaks the page is undone and this throws. label says where it came from ("Claude Code").
 */
export async function applyRemoteLook(look, label) {
  return replaceLook(look, { kind: "remote", label });
}

/** Whether this device has an image, by the SHA-256 of its bytes. */
export async function hasImage(hash) {
  return Boolean(await store.getBlob(hash).catch(() => null));
}

/** An image this device has, by hash, or null. */
export async function getImageBlob(hash) {
  return (await store.getBlob(hash).catch(() => null)) ?? null;
}

/** Stores an image that arrived from elsewhere, checking its bytes match the hash it came under. */
export async function storeImage(hash, blob) {
  checkImage(blob.type, blob.size);
  if ((await sha256(blob)) !== hash) throw new ThemeError("An image arrived damaged (its bytes don't match)");
  await store.putBlob(hash, blob);
}

// ---------- your themes ----------

// The library: every theme of yours, by id, kept in IndexedDB ("themes") and mirrored here so changes stay
// synchronous. An entry is { id, look, rev, synced, deleted, syncedDeleted, account, createdBy, createdAt, updatedAt }:
// look is the theme's content on this device ({ name, base, tokens, css, images }); rev is the account's revision of it
// that this device last agreed with (0: never sent) and synced its content then; deleted and syncedDeleted the same
// for deleting it; account the account it was synced with. look-sync.js sends what changed here and takes in what
// changed elsewhere. The theme in use is written through to its entry on every change (write()).
const library = new Map();
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("lx-themes");

function newEntry(id, content) {
  const now = Date.now();
  return { id, look: rules.themeContent(content), rev: 0, synced: null, deleted: false, syncedDeleted: false, account: null, createdBy: "device", createdAt: now, updatedAt: now };
}

let persisting = Promise.resolve();
/** Saves an entry (or removes it) in IndexedDB, in order, then tells other tabs. */
function persistEntry(entry, { remove = false } = {}) {
  const copy = remove ? null : structuredClone(entry);
  persisting = persisting
    .then(() => (remove ? store.deleteTheme(entry.id) : store.putTheme(copy)))
    .catch(() => {
      // No IndexedDB: the library lasts for this visit.
    })
    .then(() => channel?.postMessage({ id: entry.id }));
  return persisting;
}

/** Resolves once every change to the library so far is stored. */
export function flushLibrary() {
  return persisting;
}

function addEntry(entry) {
  library.set(entry.id, entry);
  persistEntry(entry);
}

function updateEntry(id, patch) {
  const entry = { ...library.get(id), ...patch, updatedAt: Date.now() };
  library.set(id, entry);
  persistEntry(entry);
  return entry;
}

async function loadLibrary() {
  library.clear();
  try {
    for (const entry of await store.themes()) library.set(entry.id, entry);
  } catch {}
  // Another tab changed the library: take it in. The theme in use here keeps its content from this tab's look.
  channel?.addEventListener("message", async () => {
    let entries;
    try {
      entries = await store.themes();
    } catch {
      return;
    }
    const inUse = library.get(settings.look.theme);
    library.clear();
    for (const entry of entries) library.set(entry.id, entry);
    if (inUse && library.has(inUse.id)) library.set(inUse.id, { ...library.get(inUse.id), look: inUse.look });
    notify({ kind: "library" });
  });
}

const liveNames = (exceptId) => [...library.values()].filter((e) => !e.deleted && e.id !== exceptId).map((e) => e.look.name);
/** name, or "name 2" and so on if another theme of yours has it. */
const uniqueThemeName = (name, exceptId) => rules.uniqueName(name, liveNames(exceptId));

/** Keeps the theme in use's entry the same as the look (called on every save). */
function writeThrough() {
  const id = settings.look.theme;
  if (!id) return;
  const content = rules.themeContent(currentLook());
  const entry = library.get(id);
  if (!entry) addEntry(newEntry(id, content));
  else if (entry.deleted || !rules.sameContent(entry.look, content)) updateEntry(id, { look: content, deleted: false });
}

/**
 * On a built-in theme as it comes, a change starts a theme of yours (built-in themes never change): named `name`, or
 * "<Built-in>, edited". Call it just before changing settings.look. Returns { started: name }, or {} if nothing started.
 */
function startOwnTheme(name = "") {
  if (settings.look.theme || rules.hasChanges(settings.look)) return {};
  const id = rules.newThemeId();
  const label = name ? uniqueThemeName(name) : rules.editedName(settings.theme, liveNames());
  settings.look.theme = id;
  settings.look.name = label;
  addEntry(newEntry(id, currentLook()));
  return { started: label };
}

/**
 * A look from before saved themes changes things but belongs to no theme. On a device that has never synced with an
 * account it becomes a theme of yours now. On one that has, look-sync gives it the account's theme (the account made
 * its look a theme), so it waits for that (reading look-sync's record, so this module needn't import it).
 */
function adoptOrphanLook() {
  if (settings.look.theme || !rules.hasChanges(settings.look)) return;
  let syncedRev = 0;
  try {
    syncedRev = JSON.parse(localStorage.getItem("lx.look-sync.v1") ?? "null")?.rev ?? 0;
  } catch {}
  if (syncedRev > 0) return;
  const id = rules.newThemeId();
  settings.look.theme = id;
  settings.look.name = uniqueThemeName(settings.look.name || "My theme");
  addEntry(newEntry(id, currentLook()));
  write();
}

const view = (entry) => ({
  id: entry.id,
  name: entry.look.name || "Untitled theme",
  base: entry.look.base,
  look: structuredClone(entry.look),
  createdBy: entry.createdBy,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  inUse: entry.id === settings.look.theme,
});

/** Your themes, oldest first: [{ id, name, base, look, createdBy, createdAt, updatedAt, inUse }]. */
export function themes() {
  return [...library.values()]
    .filter((entry) => !entry.deleted)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
    .map(view);
}

/** One of your themes, as themes() shows it, or null. */
export function savedTheme(id) {
  const entry = library.get(id);
  return entry && !entry.deleted ? view(entry) : null;
}

/**
 * Switches to a theme: a built-in one or one of yours, by id. No theme changes, so the one you leave stays as it was.
 * Guarded like any whole-look change. Returns the recent look to undo to (which switches back), or null if it was in
 * use already.
 */
export async function useTheme(id) {
  const built = BUILT_IN_THEMES.find((t) => t.id === id) ?? readyTheme(id);
  let look;
  if (built) look = { ...rules.emptyLook(), base: id };
  else {
    const entry = library.get(id);
    if (!entry || entry.deleted) throw new ThemeError("That theme isn't on this device");
    look = { ...entry.look, theme: id };
  }
  if (rules.sameLook(currentLook(), look)) return null;
  // A flag's theme is told as "Japan's flag" (theme-names.js), never as the country.
  return replaceLook(look, { kind: "switch", label: built ? themeLabel(id, built.name) : look.name || "Untitled theme" });
}

/** Copies one of your themes as a new theme ("Delft copy"), not in use. Returns its id. */
export function duplicateTheme(id) {
  const source = id === settings.look.theme ? rules.themeContent(currentLook()) : library.get(id)?.look;
  if (!source) throw new ThemeError("That theme isn't on this device");
  const copy = newEntry(rules.newThemeId(), { ...source, name: rules.copyName(source.name || "Untitled theme", liveNames()) });
  addEntry(copy);
  notify({ kind: "library" });
  return copy.id;
}

/** Renames one of your themes (a name another theme of yours has gets a number). */
export function renameTheme(id, name) {
  const text = String(name ?? "").trim().slice(0, rules.LOOK_LIMITS.nameLength);
  if (!text) throw new ThemeError("Give it a name");
  if (id === settings.look.theme) return setLookName(text);
  const entry = library.get(id);
  if (!entry || entry.deleted) throw new ThemeError("That theme isn't on this device");
  updateEntry(id, { look: { ...entry.look, name: uniqueThemeName(text, id) } });
  notify({ kind: "library" });
}

/** Sets the built-in theme one of your themes starts from. */
export function setThemeBase(id, base) {
  if (!rules.BASE_THEMES.includes(base)) throw new ThemeError(`No built-in theme called "${base}"`);
  if (id === settings.look.theme) return setBase(base);
  const entry = library.get(id);
  if (!entry || entry.deleted) throw new ThemeError("That theme isn't on this device");
  updateEntry(id, { look: { ...entry.look, base } });
  notify({ kind: "library" });
}

/**
 * Deletes one of your themes (your account keeps it a while, so it can come back). If it's in use, the app switches
 * to the built-in theme it started from first. Returns { name, undo }: undo() brings it back, and back into use if it
 * was.
 */
export async function deleteTheme(id) {
  const entry = library.get(id);
  if (!entry || entry.deleted) throw new ThemeError("That theme isn't on this device");
  const wasInUse = id === settings.look.theme;
  if (wasInUse) await useTheme(entry.look.base);
  const name = library.get(id).look.name || "Untitled theme";
  updateEntry(id, { deleted: true });
  notify({ kind: "library" });
  return {
    name,
    undo: async () => {
      restoreDeletedTheme(id);
      if (wasInUse) await useTheme(id);
    },
  };
}

/** Brings back a theme you deleted (not into use). */
export function restoreDeletedTheme(id) {
  if (!library.get(id)?.deleted) return;
  updateEntry(id, { deleted: false });
  notify({ kind: "library" });
}

// For look-sync.js:

/** Every library entry, deleted ones too, as stored. */
export function libraryEntries() {
  return [...library.values()].map((entry) => structuredClone(entry));
}

/** Stores an entry as look-sync left it (no change event: call librarySynced() after a batch). */
export function putLibraryEntry(entry) {
  library.set(entry.id, entry);
  persistEntry(entry);
}

/** One library entry as stored (deleted or not), or null. */
export function libraryEntry(id) {
  const entry = library.get(id);
  return entry ? structuredClone(entry) : null;
}

export function removeLibraryEntry(id) {
  library.delete(id);
  persistEntry({ id }, { remove: true });
}

/** Tells listeners the library changed from the account. */
export function librarySynced() {
  notify({ kind: "library-sync" });
}

/**
 * Gives the look in use a saved theme's id and name without changing what shows: a look from before saved themes, now
 * a theme on the account.
 */
export function adoptThemeId(id, name) {
  settings.look.theme = id;
  settings.look.name = name;
  write();
  notify({ kind: "library-sync" });
}

// ---------- the safety net ----------

/** What each usability check says right now: null where the page is fine. */
const usability = () => (SAFE_MODE ? [] : [...usabilityChecks].map((check) => [check, check()]));

/**
 * Commits, then runs the usability checks. A check fails the new look only if it passed under the old one (so a part
 * that was already out of sight, like a closed panel, doesn't count). On a failure the previous settings come back
 * and this throws. Call it with settings changed but not yet applied: the page still shows the old look.
 */
function guardedCommit(change, before) {
  const fine = new Set(usability().filter(([, reason]) => !reason).map(([check]) => check));
  write();
  apply();
  const reason = usability().find(([check, now]) => now && fine.has(check))?.[1] ?? null;
  if (reason) {
    settings = before;
    write();
    apply();
    // The new look's images may have replaced the old ones' URLs: bring them back.
    loadImages().then(apply).catch(() => {});
    notify({ kind: "reverted", reason, undo: change.undo });
    throw new ThemeError(`That look ${reason}, so it was undone`);
  }
  notify(change);
}

// ---------- changing it ----------

/**
 * Sets the built-in theme the theme in use starts from (its base). On a built-in theme that's switching to another
 * built-in theme.
 */
export function setBase(id) {
  if (!rules.BASE_THEMES.includes(id)) throw new ThemeError(`No built-in theme called "${id}"`);
  if (!settings.look.theme && !rules.hasChanges(settings.look)) return useTheme(id);
  const undo = takeSnapshot("theme", { coalesce: true }).id;
  settings.theme = id;
  commit({ kind: "theme", undo });
}

/** Switches to a built-in theme (kept for older callers: useTheme switches to any theme). */
export const setTheme = (id) => useTheme(id);

export function setPreset(name, value) {
  const preset = PRESETS[name];
  if (!preset || !preset.options.some(([id]) => id === value)) throw new ThemeError(`"${value}" isn't an option for ${name}`);
  settings.presets[name] = value;
  commit({ kind: "preset" });
}

/** Replaces all token overrides. Returns what was left out and why. */
export function setTokens(tokens) {
  const result = rules.checkTokens(tokens);
  if (!settings.look.theme && !Object.keys(result.tokens).length && !Object.keys(settings.look.tokens).length) return result.removed;
  const undo = takeSnapshot("tokens", { coalesce: true }).id;
  const started = startOwnTheme();
  settings.look.tokens = result.tokens;
  commit({ kind: "tokens", undo, ...started });
  return result.removed;
}

export function setToken(name, value) {
  const tokens = { ...settings.look.tokens };
  if (value === null || value === undefined || String(value).trim() === "") delete tokens[name];
  else tokens[name] = value;
  return setTokens(tokens);
}

/**
 * Saves and applies custom CSS. Returns what the check removed, so the UI can say so. Throws a ThemeError (with the
 * CSS left as it was) if the new CSS makes the page unusable.
 */
export function setCustomCss(text) {
  const result = sanitizeCss(text);
  if (result.css === settings.look.css) return result.removed;
  const before = getSettings();
  const undo = takeSnapshot("css").id;
  const started = startOwnTheme();
  settings.look.css = result.css;
  guardedCommit({ kind: "css", undo, ...started }, before);
  return result.removed;
}

/** Names the theme in use. On a built-in theme, a name starts a theme of yours with that name. */
export function setLookName(name) {
  const text = String(name ?? "").trim().slice(0, rules.LOOK_LIMITS.nameLength);
  if (!settings.look.theme && !rules.hasChanges(settings.look) && !text) return;
  if (settings.look.theme && !text) return;
  const undo = takeSnapshot("name", { coalesce: true }).id;
  const started = startOwnTheme(text);
  settings.look.name = settings.look.theme ? uniqueThemeName(text, settings.look.theme) : text;
  commit({ kind: "name", undo, ...started });
}

/** The blob: URL of a look's image, or null. */
export function getImageUrl(slot) {
  const hash = settings.look.images[slot]?.hash;
  return (hash && blobUrls.get(hash)) || null;
}

/**
 * Makes a picked file fit: anything over the size limit, or bigger than 2560px a side, is scaled down and re-encoded
 * (WebP where the browser can write it, else JPEG). GIFs and SVGs are kept as they are, so they must fit already.
 * Returns a Blob.
 */
export async function prepareImage(file) {
  const type = file.type;
  if (!rules.IMAGE_TYPES.includes(type) && !CONVERTIBLE.includes(type)) throw new ThemeError("Images can be PNG, JPEG, WebP, GIF, AVIF or SVG");
  if (!SCALABLE.includes(type)) {
    checkImage(type, file.size);
    return file;
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (CONVERTIBLE.includes(type)) throw new ThemeError("This browser can't read HEIC photos: save it as JPEG or PNG first");
    throw new ThemeError("That image couldn't be read");
  }
  const side = Math.max(bitmap.width, bitmap.height);
  if (!CONVERTIBLE.includes(type) && file.size <= rules.LOOK_LIMITS.imageBytes && side <= IMAGE_MAX_SIDE) {
    bitmap.close();
    return file;
  }
  try {
    for (const maxSide of [IMAGE_MAX_SIDE, 1920, 1280]) {
      const scale = Math.min(1, maxSide / side);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.72]) {
        let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        // Safari can't write WebP and hands back a PNG instead; JPEG is the fallback that stays small.
        if (!blob || blob.type !== "image/webp") blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= rules.LOOK_LIMITS.imageBytes) return blob;
      }
    }
  } finally {
    bitmap.close();
  }
  throw new ThemeError(`That image is too big even scaled down; images can be up to ${rules.LOOK_LIMITS.imageBytes / 1_000_000} MB`);
}

/** Adds or replaces an image slot. Big photos are scaled down first (prepareImage). Returns the stored size. */
export async function setImage(slot, file) {
  if (!rules.SLOT_NAME.test(slot)) throw new ThemeError("Image names use lowercase letters, numbers and dashes, starting with a letter");
  if (!(slot in settings.look.images) && Object.keys(settings.look.images).length >= rules.LOOK_LIMITS.imageCount) {
    throw new ThemeError(`A look can hold up to ${rules.LOOK_LIMITS.imageCount} images`);
  }
  const blob = await prepareImage(file);
  const hash = await sha256(blob);
  await store.putBlob(hash, blob);
  const snap = takeSnapshot("image");
  await snap.saved;
  const undo = snap.id;
  const before = getSettings();
  const started = startOwnTheme();
  settings.look.images[slot] = { hash, type: blob.type, size: blob.size, name: String(file.name ?? "").slice(0, 120) };
  await loadImages();
  guardedCommit({ kind: "image", undo, ...started }, before);
  collectImages().catch(() => {});
  return { size: blob.size, scaled: blob !== file };
}

/** Empties an image slot. A section's background takes its own settings with it (--image-background-<section>-*). */
export async function removeImage(slot) {
  if (!(slot in settings.look.images)) return;
  const snap = takeSnapshot("image");
  await snap.saved;
  const undo = snap.id;
  delete settings.look.images[slot];
  const section = /^background-([a-z]+)$/.exec(slot)?.[1];
  if (section in rules.SECTIONS) for (const name of rules.BACKGROUND_SETTINGS) delete settings.look.tokens[`--image-${slot}-${name}`];
  await loadImages();
  commit({ kind: "image", undo });
  collectImages().catch(() => {});
}

/**
 * Clears the theme in use's tokens, CSS and images (it stays a theme of yours, with its name and base), and keeps the
 * presets. Returns the recent look to undo to.
 */
export async function resetLook() {
  if (!rules.hasChanges(settings.look)) return null;
  const snap = takeSnapshot("reset");
  await snap.saved;
  const undo = snap.id;
  settings.look = { ...defaults().look, theme: settings.look.theme, name: settings.look.name };
  await loadImages();
  commit({ kind: "reset", undo });
  collectImages().catch(() => {});
  return undo;
}

/**
 * Forgets every recent look, every theme in the library and every stored image (deleting the account, say). The look
 * goes back to its built-in theme as it comes.
 */
export async function clearHistory() {
  settings.look = defaults().look;
  write();
  apply();
  library.clear();
  try {
    for (const entry of await store.history()) await store.deleteHistory(entry.id);
    await store.clearThemes();
    freshBlobs.clear();
    await collectImages([]);
  } catch {}
  notify({ kind: "library" });
}

function checkImage(type, size) {
  if (!rules.IMAGE_TYPES.includes(type)) throw new ThemeError("Images can be PNG, JPEG, WebP, GIF, AVIF or SVG");
  if (size > rules.LOOK_LIMITS.imageBytes) throw new ThemeError(`Each image can be up to ${rules.LOOK_LIMITS.imageBytes / 1_000_000} MB`);
}

// ---------- checking CSS ----------

/** The safety check (css-safety.js), with its errors as ThemeErrors so the UI shows their message. */
export function sanitizeCss(input) {
  try {
    return rules.checkCss(input);
  } catch (error) {
    throw toThemeError(error);
  }
}

// ---------- sharing ----------

/** The current look as a theme file (a Blob of JSON), images embedded as data: URLs. */
export async function exportTheme(name = settings.look.name) {
  return themeFile({ ...currentLook(), name: name || themeInUse().name });
}

/** One of your themes as a theme file (a Blob of JSON): the unit for sharing a theme. */
export async function exportSavedTheme(id) {
  await flushLibrary();
  if (id === settings.look.theme) return themeFile(currentLook());
  const entry = library.get(id);
  if (!entry || entry.deleted) throw new ThemeError("That theme isn't on this device");
  return themeFile(entry.look);
}

async function themeFile(look) {
  const embedded = {};
  for (const [slot, meta] of Object.entries(look.images ?? {})) {
    const blob = meta.hash ? await store.getBlob(meta.hash) : null;
    if (blob) embedded[slot] = await asDataUrl(blob);
  }
  const file = {
    format: THEME_FILE_FORMAT,
    version: THEME_FILE_VERSION,
    surface: THEMING_SURFACE_VERSION,
    name: String(look.name || "My theme").slice(0, rules.LOOK_LIMITS.nameLength),
    base: look.base,
    tokens: look.tokens,
    css: look.css,
    images: embedded,
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
}

/** Reads a theme file and returns it checked, without applying it: { name, base, tokens, css, images, notes }. */
export async function readThemeFile(file) {
  if (file.size > LIMITS.themeFileBytes) throw new ThemeError(`Theme files can be up to ${LIMITS.themeFileBytes / 1_000_000} MB`);
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new ThemeError("This isn't a Lexicommons theme file (it isn't JSON)");
  }
  if (data?.format !== THEME_FILE_FORMAT) throw new ThemeError("This isn't a Lexicommons theme file");
  if (typeof data.version !== "number" || data.version > THEME_FILE_VERSION) {
    throw new ThemeError("This theme was made by a newer version of Lexicommons");
  }
  const notes = [];
  if (Number(data.surface) > THEMING_SURFACE_VERSION) {
    notes.push(`Made for theming surface v${data.surface}; this app has v${THEMING_SURFACE_VERSION}, so some of its CSS may not apply`);
  }
  let checked;
  try {
    checked = rules.checkLook({ name: data.name, base: rules.BASE_THEMES.includes(data.base) ? data.base : "graphite", tokens: data.tokens, css: data.css });
  } catch (error) {
    throw toThemeError(error);
  }
  notes.push(...checked.notes);
  const decoded = {};
  for (const [slot, url] of Object.entries(data.images && typeof data.images === "object" ? data.images : {})) {
    try {
      if (!rules.SLOT_NAME.test(slot)) throw new ThemeError("bad image name");
      if (Object.keys(decoded).length >= rules.LOOK_LIMITS.imageCount) throw new ThemeError(`more than ${rules.LOOK_LIMITS.imageCount} images`);
      decoded[slot] = fromDataUrl(url);
    } catch (error) {
      notes.push(`Image "${slot}" left out: ${error.message}`);
    }
  }
  const { look } = checked;
  return { name: String(data.name ?? "Imported theme").slice(0, rules.LOOK_LIMITS.nameLength) || "Imported theme", base: look.base, tokens: look.tokens, css: look.css, images: decoded, notes };
}

/**
 * Adds a checked theme file (from readThemeFile) to your themes as a new theme, and switches to it. None of your
 * other themes change, and presets stay as they are. Returns the undo id (which switches back).
 */
export async function applyThemeFile(theme) {
  const images = {};
  for (const [slot, blob] of Object.entries(theme.images ?? {})) {
    const hash = await sha256(blob);
    await store.putBlob(hash, blob);
    images[slot] = { hash, type: blob.type, size: blob.size, name: `${slot} (from theme)` };
  }
  const id = rules.newThemeId();
  const name = uniqueThemeName(theme.name || "Imported theme");
  const content = rules.themeContent({ name, base: theme.base, tokens: theme.tokens, css: theme.css, images });
  addEntry(newEntry(id, content));
  return replaceLook({ ...content, theme: id }, { kind: "import", label: name });
}

function asDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Decoded by hand: fetch() of a data: URL would need data: in the CSP's connect-src.
function fromDataUrl(url) {
  const match = /^data:([a-z0-9.+\/-]+);base64,([a-z0-9+\/=\s]+)$/i.exec(String(url ?? ""));
  if (!match) throw new ThemeError("not an embedded image");
  const type = match[1].toLowerCase();
  const binary = atob(match[2].replace(/\s+/g, ""));
  checkImage(type, binary.length);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function sha256(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- IndexedDB: images by hash, recent looks ----------

const store = (() => {
  const DB = "lexicommons-appearance";
  let opening = null;
  const db = () =>
    (opening ??= new Promise((resolve, reject) => {
      // v1 had one store, "images", keyed by slot. v2 keys images by hash ("blobs") and keeps recent looks. v3 keeps
      // the library of your themes ("themes").
      const request = indexedDB.open(DB, 3);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("images")) database.createObjectStore("images");
        if (!database.objectStoreNames.contains("blobs")) database.createObjectStore("blobs");
        if (!database.objectStoreNames.contains("history")) database.createObjectStore("history", { keyPath: "id" });
        if (!database.objectStoreNames.contains("themes")) database.createObjectStore("themes", { keyPath: "id" });
      };
      let settled = false;
      request.onsuccess = () => {
        // Another tab opening a newer version: let it.
        request.result.onversionchange = () => {
          request.result.close();
          opening = null;
        };
        if (settled) return request.result.close();
        settled = true;
        resolve(request.result);
      };
      request.onerror = () => {
        settled = true;
        opening = null;
        reject(request.error);
      };
      // An open tab from before this version holds the old one and never lets go: carry on without the store (the
      // look still applies) rather than wait, and try again next time.
      request.onblocked = () =>
        setTimeout(() => {
          if (settled) return;
          settled = true;
          opening = null;
          reject(new ThemeError("Another Lexicommons tab is using an older version: reload it"));
        }, 2000);
    }));
  const run = async (name, mode, action) => {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(name, mode);
      const request = action(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new ThemeError("Couldn't save the image on this device"));
    });
  };
  return {
    getBlob: (hash) => run("blobs", "readonly", (s) => s.get(hash)),
    putBlob: (hash, blob) => {
      freshBlobs.set(hash, Date.now());
      return run("blobs", "readwrite", (s) => s.put(blob, hash));
    },
    deleteBlob: (hash) => run("blobs", "readwrite", (s) => s.delete(hash)),
    blobKeys: () => run("blobs", "readonly", (s) => s.getAllKeys()),
    getLegacy: (slot) => run("images", "readonly", (s) => s.get(slot)),
    clearLegacy: () => run("images", "readwrite", (s) => s.clear()),
    history: async () => (await run("history", "readonly", (s) => s.getAll())).sort((a, b) => b.at - a.at),
    getHistory: (id) => run("history", "readonly", (s) => s.get(id)),
    putHistory: (entry) => run("history", "readwrite", (s) => s.put(entry)),
    deleteHistory: (id) => run("history", "readwrite", (s) => s.delete(id)),
    themes: () => run("themes", "readonly", (s) => s.getAll()),
    putTheme: (entry) => run("themes", "readwrite", (s) => s.put(entry)),
    deleteTheme: (id) => run("themes", "readwrite", (s) => s.delete(id)),
    clearThemes: () => run("themes", "readwrite", (s) => s.clear()),
  };
})();

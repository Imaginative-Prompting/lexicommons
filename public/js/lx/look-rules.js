// The rules every look follows, wherever it comes from: the editors on the device, a theme file, or your AI through
// MCP. A look is { theme, name, base, tokens, css, images }: which saved theme it is (null for a built-in theme as it
// comes), a built-in theme to start from, token overrides, custom CSS, and image slots. A saved theme's content is the
// same without `theme`. Pure (no DOM), so the Worker runs the same checks as the app (src/theming.ts) and Node tests
// them (scripts/test-look-rules.mjs).

import { sanitizeCss, CssSafetyError, CSS_LIMIT_BYTES } from "./css-safety.js";
import { READY_THEMES } from "./theme-presets.js";

export const LOOK_LIMITS = {
  cssBytes: CSS_LIMIT_BYTES,
  tokenCount: 300,
  tokenValueLength: 500,
  imageBytes: 4_000_000,
  imageCount: 12,
  nameLength: 80,
};

/**
 * The built-in themes. They never change: a look that changes anything is a theme of the person's own, saved with a
 * name, and starts from one of these (its base).
 */
export const BUILT_IN_THEMES = [
  { id: "graphite", name: "Graphite", about: "Graphite on black: NeedWright's dark register, the default" },
  { id: "paper", name: "Paper", about: "Ink on warm paper: NeedWright's light register" },
  { id: "auto", name: "Match device", about: "Graphite or Paper, following the device's dark or light setting" },
  { id: "contrast", name: "High contrast", about: "Pure black and white with strong edges" },
  { id: "sepia", name: "Sepia", about: "Warm paper and a serif for long reading" },
];
/**
 * Every theme a look can start from: the built-in ones, then the ready-made ones (lx/theme-presets.js: general themes, a language's motif,
 * its flag), each { id, name, about }. A ready-made one sits on Graphite or Paper and sets its own tokens over it.
 */
export const BASE_THEME_LIST = [...BUILT_IN_THEMES, ...READY_THEMES.map(({ id, name, about }) => ({ id, name, about }))];
export const BASE_THEMES = BASE_THEME_LIST.map((t) => t.id);
/** A saved theme's id: made on a device or on the server, unique within an account. */
export const THEME_ID = /^[a-z0-9]{8,32}$/;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml"];
/** How a background image sits: --image-background-<setting>, and per section --image-background-<section>-<setting>. */
export const BACKGROUND_SETTINGS = ["size", "repeat", "position", "dim", "blur"];
// Slot names are lowercase with dashes, and never the name of a background setting token (an image in a slot called
// background-read-size would land on the token --image-background-read-size).
export const SLOT_NAME = /^(?!background(?:-[a-z]+)?-(?:size|repeat|position|dim|blur)$)[a-z][a-z0-9-]{0,31}$/;
export const TOKEN_NAME = /^--[a-z][a-z0-9-]{0,63}$/;
const HASH = /^[0-9a-f]{64}$/;

/**
 * The app's sections, each of which can have a background of its own (slot background-<section>) that shows there in
 * place of the main one. The app marks the section on <html> as data-section. A study session falls back to Study's
 * background before the main one.
 */
export const SECTIONS = {
  today: "Home",
  study: "Study",
  read: "Read",
  know: "Know",
  explore: "Explore",
  settings: "Settings",
  session: "Study sessions",
};

/** The section whose background a section shows when it has none of its own (after that, the main background). */
export const SECTION_FALLBACK = { session: "study" };

/** Image slots every look can fill. A look can add its own (--image-<name>, used from custom CSS). */
export const IMAGE_SLOTS = {
  background: "Behind the whole app, except sections with a background of their own",
  mark: "The logo square in the header",
  ...Object.fromEntries(
    Object.entries(SECTIONS).map(([id, name]) => [`background-${id}`, `Behind ${name} only${SECTION_FALLBACK[id] ? ` (otherwise ${SECTIONS[SECTION_FALLBACK[id]]}'s, then the background)` : " (otherwise the background)"}`]),
  ),
};

/** The meaning colors whose background tint and edge are mixed from the color itself. */
export const MIXED_MEANINGS = ["right", "wrong", "slipping"];

/**
 * The tokens a person (or their AI) is most likely to change, grouped and named the way the Colors page shows them.
 * Every other token in tokens.css can be changed too.
 */
export const TOKEN_GUIDE = [
  ["Page", "--canvas", "Page background and header"],
  ["Page", "--chrome", "Sheets, notices and the wide-screen sidebar"],
  ["Page", "--bar-glass", "The floating tab bar"],
  ["Page", "--tab-on", "The tab you're on"],
  ["Page", "--well", "Cards"],
  ["Page", "--fill", "Controls and rows"],
  ["Page", "--fill-hover", "Controls under the pointer"],
  ["Page", "--fill-active", "Controls being pressed"],
  ["Text", "--ink-1", "Main text"],
  ["Text", "--ink-2", "Secondary text"],
  ["Text", "--ink-3", "Quiet text"],
  ["Text", "--ink-4", "Faint text and icons"],
  ["Text", "--selection", "Selected text"],
  ["Text", "--highlight", "Your highlights in the reader"],
  ["Lines", "--hair", "Dividers"],
  ["Lines", "--edge", "Borders"],
  ["Lines", "--edge-strong", "Strong borders"],
  ["Lines", "--ring", "Focus ring"],
  ["Main button", "--solid", "Main button"],
  ["Main button", "--solid-hover", "Main button under the pointer"],
  ["Main button", "--on-solid", "Text on the main button"],
  ["Main button", "--go", "The way forward (Start, Continue)"],
  ["Main button", "--go-deep", "The way forward's hard edge"],
  ["Main button", "--on-go", "Text on the way forward"],
  ["Meaning", "--m-right", "Right"],
  ["Meaning", "--m-wrong", "Wrong"],
  ["Meaning", "--m-slipping", "Slipping"],
  ["Meaning", "--m-moved-mark", "Moved word highlight"],
  ["Meaning", "--m-moved-line", "Moved word underline"],
  ["Meaning", "--m-moved-ink", "Text on a moved word"],
  ["How well you know it", "--strength-0", "Not seen yet"],
  ["How well you know it", "--strength-1", "Just started"],
  ["How well you know it", "--strength-2", "Getting there"],
  ["How well you know it", "--strength-3", "Strong"],
  ["How well you know it", "--strength-4", "Solid"],
  ["Behind sheets", "--backdrop", "Behind sheets and sessions"],
  ["Type", "--type-ui", "Text font"],
  ["Type", "--type-head", "Headings font"],
  ["Type", "--type-read", "Reading font (long texts and the sentence you study)"],
  ["Type", "--size-read", "Reading size"],
  ["Type", "--size-target", "Size of the sentence you study"],
  ["Shape", "--radius-8", "Small corners (icons, tags)"],
  ["Shape", "--radius-12", "Medium corners (fields, rows)"],
  ["Shape", "--radius-16", "Large corners (cards)"],
  ["Shape", "--radius-24", "Study card corners"],
  ["Shape", "--page-width", "Widest the page gets"],
  ["Background image", "--image-background-size", "cover (fill the screen), contain (whole image) or auto (tiles)"],
  ["Background image", "--image-background-repeat", "no-repeat, or repeat for tiles"],
  ["Background image", "--image-background-position", "Where it sits: center, top, bottom, …"],
  ["Background image", "--image-background-dim", "How much of the page color lies over it, 0% to 90%"],
  ["Background image", "--image-background-blur", "Blur, 0px to 24px"],
  ["Motion", "--dur-150", "Quick changes"],
  ["Motion", "--dur-320", "Moves"],
  ["Motion", "--dur-640", "Signature moments (the word-order slide)"],
].map(([group, name, label]) => ({ group, name, label }));

export const COLOUR_GROUPS = ["Page", "Text", "Lines", "Main button", "Meaning", "How well you know it", "Behind sheets"];

export class LookError extends Error {}

// A field read as text or a number, as String() and Number() read every primitive, but never from an object: JSON can
// carry one whose toString is null, which they throw on. An object reads as "" or NaN; shown is for messages.
const asText = (value) => (value !== null && typeof value === "object" ? "" : String(value));
const asNumber = (value) => (value !== null && typeof value === "object" ? NaN : Number(value));
const shown = (value) => (typeof value === "string" ? value : (JSON.stringify(value) ?? asText(value)));

// Quoted strings, so ; { } can appear inside them (a data: URL's ";base64") but nowhere else.
const QUOTED = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;

/**
 * Whether a token's value could break out of its declaration: ; { } outside quotes, an unclosed quote, a line break
 * or a trailing backslash. The token stylesheet writes each as `name: value;`, so a value must stay one value.
 */
export function breaksOut(value) {
  // A trailing backslash would escape the ; that ends the declaration and swallow the next one.
  return /[;{}"'\n\r]|\\$/.test(asText(value).replace(QUOTED, ""));
}

export function emptyLook() {
  return { theme: null, name: "", base: "graphite", tokens: {}, css: "", images: {} };
}

/** A new saved theme's id: 16 random lowercase letters and digits. */
export function newThemeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

/** Whether a look changes anything (tokens, CSS or images). One that doesn't is its built-in theme as it comes. */
export function hasChanges(look) {
  return Boolean(Object.keys(look?.tokens ?? {}).length || look?.css || Object.keys(look?.images ?? {}).length);
}

/** A saved theme's content: the look without `theme`. */
export function themeContent(look) {
  const { theme: _theme, ...content } = checkLook(look).look;
  return content;
}

export const builtInName = (id) => BASE_THEME_LIST.find((t) => t.id === id)?.name ?? id;

/** name, or "name 2", "name 3", … : the first that none of `taken` has (case aside). */
export function uniqueName(name, taken) {
  const used = new Set([...taken].map((n) => asText(n).trim().toLowerCase()));
  const base = asText(name).trim().slice(0, LOOK_LIMITS.nameLength - 3) || "My theme";
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** The name of the theme that editing a built-in theme starts: "Graphite, edited". */
export const editedName = (base, taken = []) => uniqueName(`${builtInName(base)}, edited`, taken);
/** The name of a theme's copy: "Delft copy". */
export const copyName = (name, taken = []) => uniqueName(`${asText(name).trim() || "My theme"} copy`, taken);

/** The safety check (css-safety.js), with its size error as a LookError. Returns { css, removed: [{ what, count }] }. */
export function checkCss(input) {
  try {
    return sanitizeCss(asText(input ?? ""));
  } catch (error) {
    if (error instanceof CssSafetyError) throw new LookError(error.message);
    throw error;
  }
}

/** Keeps the tokens that are safe and well formed. Returns { tokens, removed: [{ what, why }] }. */
export function checkTokens(tokens) {
  const out = {};
  const removed = [];
  for (const [name, raw] of Object.entries(tokens && typeof tokens === "object" ? tokens : {})) {
    if (Object.keys(out).length >= LOOK_LIMITS.tokenCount) {
      removed.push({ what: name, why: `more than ${LOOK_LIMITS.tokenCount} tokens` });
      continue;
    }
    if (!TOKEN_NAME.test(name)) {
      removed.push({ what: name, why: "token names are --lowercase-with-dashes" });
      continue;
    }
    const value = asText(raw ?? "").trim();
    if (!value || value.length > LOOK_LIMITS.tokenValueLength || breaksOut(value)) {
      removed.push({ what: name, why: "empty, too long, or has ; { } outside quotes" });
      continue;
    }
    let checked;
    try {
      checked = checkCss(value);
    } catch (error) {
      removed.push({ what: name, why: error.message });
      continue;
    }
    if (checked.removed.length) removed.push({ what: name, why: checked.removed.map((r) => r.what).join(", ") });
    out[name] = checked.css.trim();
  }
  return { tokens: out, removed };
}

/**
 * The token overrides for one meaning color: the color plus its background tint and edge, mixed from it, so a
 * custom "right" or "wrong" stays consistent everywhere it shows. Pass null to get the three names (to clear them).
 */
export function meaningTokens(meaning, colour) {
  const names = [`--m-${meaning}`, `--m-${meaning}-bg`, `--m-${meaning}-edge`];
  if (colour === null) return names;
  return {
    [names[0]]: colour,
    [names[1]]: `color-mix(in srgb, ${colour} 14%, transparent)`,
    [names[2]]: `color-mix(in srgb, ${colour} 42%, transparent)`,
  };
}

/** An image's record in a look: { hash, type, size, name }, or null when it isn't one. */
export function checkImageMeta(slot, meta) {
  if (!SLOT_NAME.test(slot) || !meta || typeof meta !== "object") return null;
  if (!IMAGE_TYPES.includes(meta.type) || !HASH.test(asText(meta.hash ?? ""))) return null;
  const size = asNumber(meta.size) || 0;
  if (size <= 0 || size > LOOK_LIMITS.imageBytes) return null;
  return { hash: meta.hash, type: meta.type, size, name: asText(meta.name ?? "").slice(0, 120) };
}

/** Checks a whole look. Returns { look, notes: [string] } with everything unsafe or malformed left out and noted. */
export function checkLook(input) {
  const source = input && typeof input === "object" ? input : {};
  const look = emptyLook();
  const notes = [];
  look.theme = typeof source.theme === "string" && THEME_ID.test(source.theme) ? source.theme : null;
  look.name = typeof source.name === "string" ? source.name.trim().slice(0, LOOK_LIMITS.nameLength) : "";
  if (source.base !== undefined && !BASE_THEMES.includes(source.base)) notes.push(`Base theme "${shown(source.base)}" isn't one of ${BASE_THEMES.join(", ")}; using graphite`);
  look.base = BASE_THEMES.includes(source.base) ? source.base : "graphite";
  const tokens = checkTokens(source.tokens);
  look.tokens = tokens.tokens;
  for (const r of tokens.removed) notes.push(`Token ${r.what} left out: ${r.why}`);
  const css = checkCss(typeof source.css === "string" ? source.css : "");
  look.css = css.css;
  for (const r of css.removed) notes.push(`Removed from the CSS: ${r.what} (${r.count})`);
  for (const [slot, meta] of Object.entries(source.images && typeof source.images === "object" ? source.images : {})) {
    const checked = checkImageMeta(slot, meta);
    if (!checked) notes.push(`Image "${slot}" left out: not a valid image record`);
    else if (Object.keys(look.images).length >= LOOK_LIMITS.imageCount) notes.push(`Image "${slot}" left out: more than ${LOOK_LIMITS.imageCount} images`);
    else look.images[slot] = checked;
  }
  return { look, notes };
}

/**
 * Applies a change to a look, the way your AI asks for one. patch = { reset?, base?, name?, tokens?, replaceTokens?,
 * css?, removeImages?, setImages? }:
 * - reset clears tokens, CSS and images first (the base theme stays unless patch.base is given);
 * - tokens merge into the look's (a null value removes that token), or replace them all with replaceTokens;
 * - setting --m-right, --m-wrong or --m-slipping also mixes its -bg and -edge partners, unless the patch sets those;
 * - css replaces the custom CSS ("" clears it);
 * - setImages = { slot: { hash, type, size, name } } puts stored images into slots (the server's upload path).
 * Returns { look, notes }, checked like any look.
 */
export function patchLook(current, patch = {}) {
  const base = checkLook(current).look;
  const next = patch.reset ? { ...emptyLook(), theme: base.theme, base: base.base, name: base.name } : structuredClone(base);
  const notes = [];
  if (patch.base !== undefined) next.base = patch.base;
  if (patch.name !== undefined) next.name = asText(patch.name ?? "");
  if (patch.tokens && typeof patch.tokens === "object") {
    const tokens = patch.replaceTokens ? {} : { ...next.tokens };
    for (const [name, value] of Object.entries(patch.tokens)) {
      const meaning = MIXED_MEANINGS.find((m) => name === `--m-${m}`);
      if (value === null || value === undefined || asText(value).trim() === "") {
        delete tokens[name];
        if (meaning) for (const partner of meaningTokens(meaning, null).slice(1)) if (!(partner in patch.tokens)) delete tokens[partner];
        continue;
      }
      tokens[name] = value;
      if (meaning) {
        const mixed = meaningTokens(meaning, asText(value).trim());
        for (const [partner, mix] of Object.entries(mixed).slice(1)) if (!(partner in patch.tokens)) tokens[partner] = mix;
      }
    }
    next.tokens = tokens;
  }
  if (patch.css !== undefined) next.css = asText(patch.css ?? "");
  for (const slot of Array.isArray(patch.removeImages) ? patch.removeImages : []) {
    if (typeof slot !== "string") notes.push(`${shown(slot)} isn't an image's name`);
    else if (slot in next.images) delete next.images[slot];
    else notes.push(`No image called "${slot}" to remove`);
  }
  for (const [slot, meta] of Object.entries(patch.setImages && typeof patch.setImages === "object" ? patch.setImages : {})) next.images[slot] = meta;
  const checked = checkLook(next);
  return { look: checked.look, notes: [...notes, ...checked.notes] };
}

/**
 * Merges two changes made from the same starting look: what changed locally (base → local) goes on top of what's
 * now on the server, field by field (name, base theme, CSS) and token by token and image by image, so two devices
 * changing different things both keep their change. Where both changed the same thing, local wins. All three are the
 * same theme's content; the result keeps the server's `theme`.
 */
export function mergeLooks(base, local, server) {
  const b = checkLook(base).look;
  const l = checkLook(local).look;
  const out = checkLook(server).look;
  for (const key of ["name", "base", "css"]) if (l[key] !== b[key]) out[key] = l[key];
  const overlay = (field, same) => {
    for (const name of new Set([...Object.keys(b[field]), ...Object.keys(l[field])])) {
      if (same(b[field][name], l[field][name])) continue;
      if (l[field][name] === undefined) delete out[field][name];
      else out[field][name] = l[field][name];
    }
  };
  overlay("tokens", (x, y) => x === y);
  overlay("images", (x, y) => x?.hash === y?.hash);
  return checkLook(out).look;
}

/** A stable text form of a look, so two looks can be compared. */
export function canonicalLook(look) {
  const { look: checked } = checkLook(look);
  const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return JSON.stringify({
    theme: checked.theme,
    name: checked.name,
    base: checked.base,
    tokens: sorted(checked.tokens),
    css: checked.css,
    images: sorted(Object.fromEntries(Object.entries(checked.images).map(([slot, meta]) => [slot, meta.hash]))),
  });
}

export function sameLook(a, b) {
  return canonicalLook(a) === canonicalLook(b);
}

/** Whether two looks show the same thing, whichever saved theme each belongs to. */
export function sameContent(a, b) {
  return canonicalLook({ ...a, theme: null }) === canonicalLook({ ...b, theme: null });
}

/** A short description of a look: "4 colors · 1.2 KB of CSS · background, mark". */
export function describeLook(look) {
  const parts = [];
  const tokens = Object.keys(look.tokens ?? {}).filter((name) => !/^--m-(right|wrong|slipping)-(bg|edge)$/.test(name)).length;
  if (tokens) parts.push(`${tokens} token${tokens === 1 ? "" : "s"}`);
  if (look.css) parts.push(`${(new TextEncoder().encode(look.css).length / 1000).toFixed(1)} KB of CSS`);
  const images = Object.keys(look.images ?? {});
  if (images.length) parts.push(images.join(", "));
  return parts.length ? parts.join(" · ") : "The theme as it comes";
}

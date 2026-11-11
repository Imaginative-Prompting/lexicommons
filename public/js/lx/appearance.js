// The Appearance editors: picking a theme (a built-in one or one of yours), your themes and each one's page, colors,
// fonts and corners, custom CSS, images, sharing, recent looks, and the layout controls, all driving the theme engine
// (theme.js). Settings gives each editor its own page (shell/settings.js); buildAppearance() lays them all out as the
// /design page's panel. Each editor keeps itself in step with the appearance (another tab, an undo, a restored look,
// your AI) and stops when its page goes (dispose).

import * as ui from "./ui.js";
import { el } from "./ui.js";
import { icon, MEANING_ICON } from "./icons.js";
import * as theme from "./theme.js";
import { PARTS } from "./parts.js";
import { READY_THEMES, flagThemeOf, motifThemeOf, readyStandIn, readyTheme, readyTokens } from "./theme-presets.js";
import { themeLabel, tileName } from "./theme-names.js";
import { formatList, t } from "./i18n.js";
import { languageName } from "../lang/index.js";
import { learning, learningName } from "../study/learning.js";

// ---------- colors: reading them back, and how readable they are ----------

let probe = null;
let canvasContext = null;

/** Any CSS color (a var() too) as { r, g, b, a } in sRGB 0–255 (a 0–1), or null. Resolved by the browser. */
export function resolveColour(value) {
  if (!probe?.isConnected) {
    probe = el("span", { class: "lx-colour-probe", "aria-hidden": "true" });
    document.body.append(probe);
  }
  probe.style.removeProperty("color");
  probe.style.setProperty("color", value);
  return parseColour(getComputedStyle(probe).color);
}

function parseColour(text) {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(text);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : rgb[5] ? rgb[4] / 100 : +rgb[4] };
  const srgb = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/.exec(text);
  if (srgb) {
    const c = (v) => Math.round(Math.min(1, Math.max(0, +v)) * 255);
    return { r: c(srgb[1]), g: c(srgb[2]), b: c(srgb[3]), a: srgb[4] === undefined ? 1 : srgb[5] ? srgb[4] / 100 : +srgb[4] };
  }
  // Anything else (oklch, lab, …): let a canvas convert it.
  canvasContext ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
  canvasContext.clearRect(0, 0, 1, 1);
  canvasContext.fillStyle = "#000";
  canvasContext.fillStyle = text;
  canvasContext.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = canvasContext.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

const hex2 = (n) => Math.round(n).toString(16).padStart(2, "0");
const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const over = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});
const luminance = ({ r, g, b }) => {
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
/** The WCAG contrast ratio of a text color on a surface, each composited over the page background. */
export function contrast(textToken, surfaceToken) {
  const page = over(resolveColour("var(--canvas)"), { r: 0, g: 0, b: 0, a: 1 });
  const surface = over(resolveColour(`var(${surfaceToken})`), page);
  const text = over(resolveColour(`var(${textToken})`), surface);
  const [hi, lo] = [luminance(text), luminance(surface)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// What the Colors page warns about: text that's hard to read on what it sits on.
const READABILITY = [
  ["--ink-1", "--canvas", 4.5, "Main text on the page background"],
  ["--ink-1", "--well", 4.5, "Main text on cards"],
  ["--ink-2", "--canvas", 3, "Secondary text on the page background"],
  ["--on-solid", "--solid", 4.5, "Text on the main button"],
  ["--m-right", "--well", 3, "Right on cards"],
  ["--m-wrong", "--well", 3, "Wrong on cards"],
];

/** The readability problems of the current colors: [{ what, ratio, aim }]. */
export function readabilityProblems() {
  return READABILITY.map(([text, surface, aim, what]) => ({ what, aim, ratio: contrast(text, surface) })).filter((p) => p.ratio < p.aim);
}

// ---------- shared pieces ----------

/** A status line for an editor's page: say(text, meaning). */
export function statusLine() {
  const node = el("p", { class: "lx-small ds-status", role: "status" });
  node.say = (text, meaning) => {
    node.replaceChildren(meaning ? icon(MEANING_ICON[meaning]) : "", text);
    node.setAttribute("data-tone", meaning ?? "");
  };
  return node;
}

function guarded(say, action) {
  return async (...args) => {
    try {
      return await action(...args);
    } catch (error) {
      say(error instanceof theme.ThemeError ? error.message : `Something went wrong: ${error.message}`, "wrong");
    }
  };
}

const kb = (n) => (n < 1_000_000 ? `${Math.max(1, Math.round(n / 1000))} KB` : `${(n / 1_000_000).toFixed(1)} MB`);

/** Sets one token, a meaning color with its tint and edge. value null resets it to the theme's. */
function setTokenValue(name, value) {
  const meaning = /^--m-(right|wrong|slipping)$/.exec(name)?.[1];
  const current = { ...theme.getSettings().look.tokens };
  if (meaning) {
    for (const key of theme.meaningTokens(meaning, null)) delete current[key];
    if (value) Object.assign(current, theme.meaningTokens(meaning, value));
  } else if (value) current[name] = value;
  else delete current[name];
  return theme.setTokens(current);
}

function sayRemoved(say, removed) {
  if (removed.length) say(`Left out: ${removed.map((r) => `${r.what} (${r.why})`).join("; ")}`, "slipping");
}

/** A choiceRow whose pressed option follows the appearance: options = [[value, label]]. */
function choice({ title, sub, options, value, onchange }) {
  const row = ui.choiceRow({ title, sub, options, value, onchange });
  row.sync = (current) => {
    options.forEach(([optionValue], i) => row.lxGroup.children[i].setAttribute("aria-pressed", String(optionValue === current)));
  };
  return row;
}

const followAppearance = (update) => {
  update(theme.getSettings());
  return theme.onChange((s) => update(s));
};

// ---------- Colors ----------

/**
 * One editable color: a chip that opens the color picker, the value as text (any CSS color), and a reset when it's
 * been changed. The picker keeps the theme's transparency, so a see-through border stays see-through.
 */
function colourRow(name, label, say) {
  const chip = el("span", { class: "lx-colour-chip", "aria-hidden": "true" }, el("span"));
  chip.firstChild.style.setProperty("background", `var(${name})`);
  const picker = el("input", { type: "color", class: "lx-colour-picker", "aria-label": `Pick: ${label}` });
  const value = el("input", { part: "text-field", class: "lx-colour-value ds-token-input", spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-label": `${label} (${name})` });
  const reset = ui.iconButton("refresh", `Back to the theme's ${label.toLowerCase()} (${name})`, { onclick: guarded(say, () => setTokenValue(name, null)) });
  const row = el(
    "div",
    { part: "list-row", class: "lx-colour-row ds-token-row" },
    el("label", { class: "lx-colour-pick" }, chip, picker),
    el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, label), value),
    reset,
  );
  let picking = false;
  picker.addEventListener("focus", () => (picking = true));
  picker.addEventListener("blur", () => (picking = false));
  picker.addEventListener("input", guarded(say, () => {
    picking = true;
    const alpha = resolveColour(`var(${name})`)?.a ?? 1;
    const hex = picker.value;
    const next = alpha < 0.995 ? `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${Math.round(alpha * 1000) / 1000})` : hex;
    value.value = next;
    sayRemoved(say, setTokenValue(name, next));
  }));
  picker.addEventListener("change", () => (picking = false));
  value.addEventListener("change", guarded(say, () => {
    const text = value.value.trim();
    if (text && !CSS.supports("color", text) && !/^var\(--[a-z0-9-]+\)$/.test(text)) {
      say(`"${text}" isn't a color CSS knows`, "wrong");
      return;
    }
    sayRemoved(say, setTokenValue(name, text || null));
  }));
  const item = el("li", { class: "lx-row-item" }, row);
  item.update = (s) => {
    const override = s.look.tokens[name];
    row.toggleAttribute("data-changed", override !== undefined);
    reset.hidden = override === undefined;
    const resolved = resolveColour(`var(${name})`);
    // The theme's own color as the color itself (a hex; eight digits when it's see-through), never the CSS that makes it (color-mix(…),
    // var(…)); what you typed stays as you typed it.
    const asHex = resolved ? `${toHex(resolved)}${resolved.a < 0.995 ? Math.round(resolved.a * 255).toString(16).padStart(2, "0") : ""}` : null;
    if (document.activeElement !== value) value.value = override ?? asHex ?? getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (resolved && !picking) picker.value = toHex(resolved);
  };
  return item;
}

/** The Colors editor: a preview, readability warnings, then every color token in groups. Returns { node, dispose }. */
export function colourEditor({ say, groups = theme.COLOUR_GROUPS, compact = false } = {}) {
  const warnings = el("div", { class: "lx-stack" });
  const rows = [];
  const sections = groups.map((groupName) => {
    const items = theme.TOKEN_GUIDE.filter((t) => t.group === groupName).map((t) => {
      const row = colourRow(t.name, t.label, say);
      rows.push(row);
      return row;
    });
    const note =
      groupName === "Meaning"
        ? "Right, wrong and slipping also tint their backgrounds and edges. New and hint use the text colors, and every meaning has an icon or mark too, so it never rests on color."
        : null;
    return ui.group(compact ? null : groupName, items, note);
  });
  const renderWarnings = () => {
    const problems = readabilityProblems();
    warnings.replaceChildren(
      ...problems.map((p) => ui.feedback("slipping", "Hard to read", `${p.what}: ${p.ratio.toFixed(1)} to 1. Aim for at least ${p.aim} to 1.`)),
    );
  };
  const stop = followAppearance((s) => {
    for (const row of rows) row.update(s);
    renderWarnings();
  });
  return { node: el("div", { class: "lx-stack lx-colour-editor" }, compact ? null : colourPreview(), warnings, ...sections), dispose: stop };
}

/** A small sample of the app in the current colors, kept in view while the colors below it change. */
function colourPreview() {
  return el(
    "div",
    { class: "lx-colour-preview", "aria-label": "Preview of your colors", role: "img", inert: true },
    el(
      "div",
      { part: "card", class: "lx-colour-sample" },
      el("p", { class: "lx-colour-sample-target" }, "Ik heb ", el("span", { class: "lx-colour-sample-moved" }, "gisteren"), " een boek gelezen."),
      el("p", { class: "lx-small lx-muted" }, "I have yesterday a book read"),
      el(
        "div",
        { class: "lx-colour-sample-row" },
        ui.badge("right"),
        ui.badge("wrong"),
        ui.badge("slipping"),
        ui.strengthMeter(3),
        ui.button("Continue", { variant: "white", size: "sm" }),
      ),
    ),
  );
}

// ---------- fonts and corners ----------

const FONTS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif',
  mono: "var(--type-mono)",
  text: "var(--type-ui)",
};
const CORNERS = {
  square: { "--radius-8": "2px", "--radius-12": "3px", "--radius-16": "4px", "--radius-24": "6px" },
  round: { "--radius-8": "12px", "--radius-12": "16px", "--radius-16": "22px", "--radius-24": "32px" },
};
const TYPE_CHOICES = [
  ["--type-ui", "Text font", [["", "Default"], ["system", "System"], ["rounded", "Rounded"], ["serif", "Serif"]]],
  ["--type-head", "Headings", [["", "Default"], ["text", "Same as text"], ["serif", "Serif"], ["rounded", "Rounded"]]],
  ["--type-read", "Reading font", [["", "Default"], ["serif", "Serif"], ["rounded", "Rounded"], ["system", "System"], ["mono", "Mono"]], "Long texts and the sentence you study"],
];

/** Fonts and corners as plain choices (each one sets tokens). Returns { node, dispose }. */
export function typeAndShapeEditor({ say } = {}) {
  // The option a token's value matches: "" for no override, null for a value of their own.
  const fontOf = (s, token) => (s.look.tokens[token] ? Object.entries(FONTS).find(([, stack]) => stack === s.look.tokens[token])?.[0] ?? null : "");
  const cornersOf = (s) => {
    const t = s.look.tokens;
    if (!Object.keys(CORNERS.round).some((n) => n in t)) return "";
    return Object.entries(CORNERS).find(([, set]) => Object.entries(set).every(([n, v]) => t[n] === v))?.[0] ?? null;
  };
  const s0 = theme.getSettings();
  // Each font's choices listed, as Headings' longer ones already are: four or five across wrap on a phone, and a wrapped line's taps reach over
  // the line above's (a segment answers 44 px by reaching past its 38; 2 px apart, the lines' reaches crossed: component-check, 7 Nov).
  const fonts = TYPE_CHOICES.map(([token, title, options, sub]) => {
    const row = choice({ title, sub, options, value: fontOf(s0, token), onchange: guarded(say, (value) => sayRemoved(say, theme.setToken(token, value ? FONTS[value] : null))) });
    row.lxGroup.classList.add("lx-segmented-stack");
    return row;
  });
  const corners = choice({
    title: "Corners",
    options: [["square", "Square"], ["", "Default"], ["round", "Round"]],
    value: cornersOf(s0),
    onchange: guarded(say, (value) => {
      const tokens = { ...theme.getSettings().look.tokens };
      for (const name of Object.keys(CORNERS.round)) delete tokens[name];
      sayRemoved(say, theme.setTokens(value ? { ...tokens, ...CORNERS[value] } : tokens));
    }),
  });
  const stop = theme.onChange((s) => {
    fonts.forEach((row, i) => row.sync(fontOf(s, TYPE_CHOICES[i][0])));
    corners.sync(cornersOf(s));
  });
  return { node: ui.namedGroup("Fonts and corners", [...fonts, corners], "Fonts come from your device, so they work offline. Any other font or size: Custom CSS."), dispose: stop };
}

// ---------- custom CSS ----------

const EXAMPLE_CSS = `/* Your CSS always wins over the app's, so plain selectors work. */
:root {
  --m-moved-mark: #2f4f6f;
  --radius-24: 32px;
}
[data-part="study-card"] {
  border-width: 2px;
}
[data-part="target-line"] {
  letter-spacing: 0.01em;
}`;

/**
 * The custom CSS editor: the text, Apply (also Cmd/Ctrl+Enter), an example, and what the safety check removed. CSS
 * that hides the page (or this editor) is undone at once. Tab indents; Escape first to Tab out. Returns { node,
 * textarea, insert(text), dispose }.
 */
export function cssEditor({ say }) {
  const box = el("textarea", {
    part: "text-field",
    class: "ds-css",
    rows: 14,
    spellcheck: "false",
    autocapitalize: "off",
    autocomplete: "off",
    "aria-label": "Custom CSS",
    placeholder: '[data-part="study-card"] { border-radius: 32px; }',
  });
  box.value = theme.getSettings().look.css;
  // The editor itself must survive the CSS it applies.
  const stopCheck = theme.addUsabilityCheck(() => (box.isConnected && !visible(box) ? "hid the CSS editor" : null));
  const apply = guarded(say, () => {
    const removed = theme.setCustomCss(box.value);
    box.value = theme.getSettings().look.css;
    if (removed.length) say(`Applied. Removed for safety: ${removed.map((r) => `${r.what} (${r.count})`).join(", ")}`, "slipping");
    else say(theme.SAFE_MODE ? "Saved. Safe mode is on, so it won't show until you leave it." : "Custom CSS applied", "right");
  });
  let escaped = false;
  box.addEventListener("keydown", (event) => {
    if (event.key === "Escape") escaped = true;
    else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      apply();
    } else if (event.key === "Tab" && !escaped && !event.shiftKey) {
      event.preventDefault();
      insertAt(box, "  ");
    } else if (event.key !== "Shift") escaped = false;
  });
  const node = el(
    "div",
    { class: "lx-stack" },
    box,
    // Example and Clear quiet beside the box; Apply the one way forward, solid, the full width.
    el(
      "div",
      { class: "ds-states" },
      ui.button("Example", { variant: "fade", size: "sm", onclick: () => (box.value = EXAMPLE_CSS) }),
      ui.button("Clear", {
        variant: "fade",
        size: "sm",
        onclick: () => {
          box.value = "";
          apply();
        },
      }),
    ),
    ui.button("Apply", { variant: "go", size: "lg", block: true, onclick: apply }),
  );
  const stop = theme.onChange((s, change) => {
    // Something else changed the CSS (an undo, another tab, a restored look): show it, unless they're typing.
    if (change?.kind !== "css" && document.activeElement !== box) box.value = s.look.css;
  });
  return {
    node,
    textarea: box,
    insert: (text, caretBack = 0) => {
      insertAt(box, text, caretBack);
      box.focus();
    },
    dispose: () => (stop(), stopCheck()),
  };
}

function insertAt(box, text, caretBack = 0) {
  const start = box.selectionStart ?? box.value.length;
  const end = box.selectionEnd ?? start;
  box.setRangeText(text, start, end, "end");
  const caret = start + text.length - caretBack;
  box.setSelectionRange(caret, caret);
}

/**
 * Whether a node shows on the page: rendered, not transparent or hidden, with some size, and on the page rather than
 * pushed off it (scrolled out of view still counts as shown).
 */
export function visible(node) {
  if (!node?.isConnected) return false;
  if (node.checkVisibility && !node.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const rect = node.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const pageHeight = Math.max(innerHeight, document.documentElement.scrollHeight);
  return rect.right > 0 && rect.left < innerWidth && rect.bottom + scrollY > 0 && rect.top + scrollY < pageHeight;
}

/** Every part a theme can style, filterable, each one inserting its selector into the editor. */
export function partsReference(editor) {
  const filter = el("input", { part: "text-field", type: "search", placeholder: "Filter: card, tile, wrong…", "aria-label": "Filter parts", autocapitalize: "off", autocorrect: "off", spellcheck: "false" });
  const list = el("ul", { part: "list", class: "lx-parts-list" });
  const describe = (p) =>
    [p.about, p.states?.length ? `states: ${p.states.join(", ")}` : null, p.variants?.length ? `variants: ${p.variants.join(", ")}` : null, p.meanings ? "takes data-meaning" : null, p.levels ? "takes data-level 0–4" : null]
      .filter(Boolean)
      .join(" · ");
  const rows = PARTS.map((p) => {
    const row = ui.listRow({
      title: p.name,
      sub: describe(p),
      trailing: icon("pencil"),
      onclick: () => {
        const snippet = `\n[data-part="${p.name}"] {\n  \n}\n`;
        editor.insert(snippet, 3);
      },
    });
    row.dataset.search = `${p.name} ${p.group} ${describe(p)}`.toLowerCase();
    return row;
  });
  list.append(...rows);
  filter.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase();
    for (const row of rows) row.hidden = Boolean(q) && !row.dataset.search.includes(q);
  });
  return el(
    "details",
    { class: "lx-details lx-parts" },
    el("summary", {}, `Parts you can style (${PARTS.length})`),
    el("p", { class: "lx-small lx-muted" }, "Tap one to add its selector. Target data-part names, never classes: they're the parts that stay the same from version to version."),
    filter,
    list,
  );
}

/** Any token by name, plus the ones you've changed that aren't on the Colors page. Returns { node, dispose }. */
export function anyTokenEditor({ say }) {
  const changed = el("ul", { part: "list" });
  const name = el("input", { part: "text-field", class: "ds-token-input", placeholder: "--size-read", spellcheck: "false", autocapitalize: "off", "aria-label": "Any CSS token: name" });
  const value = el("input", { part: "text-field", class: "ds-token-input", placeholder: "21px", spellcheck: "false", autocapitalize: "off", "aria-label": "Any CSS token: value" });
  const form = el(
    "form",
    {
      class: "ds-token-any",
      onsubmit: guarded(say, (event) => {
        event.preventDefault();
        const removed = setTokenValue(name.value.trim(), value.value.trim() || null);
        if (removed.length) sayRemoved(say, removed);
        else say(`${name.value.trim()} set`, "right");
      }),
    },
    name,
    value,
    el("button", { part: "button", variant: "gray", "data-size": "sm", type: "submit" }, "Set"),
  );
  const listed = new Set(theme.TOKEN_GUIDE.filter((t) => theme.COLOUR_GROUPS.includes(t.group)).map((t) => t.name));
  const fonts = new Set(["--type-ui", "--type-head", "--type-read", "--radius-8", "--radius-12", "--radius-16", "--radius-24"]);
  const stop = followAppearance((s) => {
    const others = Object.entries(s.look.tokens).filter(([n]) => !listed.has(n) && !fonts.has(n) && !/^--m-(right|wrong|slipping)-(bg|edge)$/.test(n) && !n.startsWith("--image-background-"));
    changed.replaceChildren(
      ...others.map(([n, v]) =>
        ui.listRow({ title: n, sub: v, trailing: ui.iconButton("refresh", `Back to the theme's ${n}`, { onclick: guarded(say, () => setTokenValue(n, null)) }) }),
      ),
    );
    changed.hidden = !others.length;
  });
  return {
    node: el("section", { class: "lx-group", "aria-label": "Any token" }, el("p", { class: "lx-choice-title" }, "Any token"), changed, form, el("p", { part: "group-note" }, "Every token is listed on the design system page, with its value under each theme.")),
    dispose: stop,
  };
}

// ---------- images ----------

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml,image/heic,image/heif";

function imagePicker(say, slot, label, { after } = {}) {
  const input = el("input", { type: "file", accept: ACCEPT, hidden: true });
  input.addEventListener("change", guarded(say, async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const name = typeof slot === "function" ? slot() : slot;
    if (!name) throw new theme.ThemeError("Give the image a name first");
    const { size, scaled } = await theme.setImage(name, file);
    // Your own images are used by name from CSS, so the name is worth saying; the built-in slots just work.
    say(`${scaled ? `Scaled down to ${kb(size)} and saved` : "Saved"}${name in theme.IMAGE_SLOTS ? "" : ` as --image-${name}`}`, "right");
    after?.();
  }));
  // A row's own action, quiet at its end (no fill, no symbol: the page's one solid way forward is elsewhere).
  return [input, ui.button(label, { variant: "fade", size: "sm", onclick: () => input.click() })];
}

/** One image slot: its thumbnail, what it is, and choose, replace and remove. */
/** An explanation behind a row (as Settings' wordsRow; /design loads this file, so it can't import Settings): a sheet with its words. */
function aboutRow(title, ...words) {
  return ui.listRow({
    title,
    opens: "sheet",
    onclick: () => {
      const sheet = ui.sheetLayer({ label: title });
      sheet.lxBody.append(el("div", { class: "lx-stack lx-sheet-words" }, el("h2", { class: "lx-sheet-title" }, title), ...words.map((text) => el("p", {}, text))));
      sheet.lxOpen();
    },
  });
}

function imageRow(say, slot, about) {
  let thumb = el("span", { class: "ds-thumb" });
  const title = el("span", { class: "lx-row-title" }, about.title ?? `--image-${slot}`);
  const sub = el("span", { class: "lx-row-sub" });
  const actions = el("span", { class: "lx-row-end" });
  const row = el("div", { part: "list-row", class: "ds-image-row lx-image-row" }, thumb, el("span", { class: "lx-row-text" }, title, sub), actions);
  const item = el("li", { class: "lx-row-item" }, row);
  item.update = (s) => {
    const meta = s.look.images[slot];
    const url = theme.getImageUrl(slot);
    if ((thumb.getAttribute("src") ?? null) !== url) {
      const next = url ? el("img", { class: "ds-thumb", src: url, alt: "" }) : el("span", { class: "ds-thumb" });
      thumb.replaceWith(next);
      thumb = next;
    }
    sub.textContent = meta ? `${meta.name || meta.type} · ${kb(meta.size)}${about.title ? "" : ` · var(--image-${slot})`}` : about.sub;
    actions.replaceChildren(
      ...[
        ...imagePicker(say, slot, meta ? "Replace" : "Choose"),
        meta && !about.title ? ui.iconButton("copy", `Copy var(--image-${slot})`, { onclick: () => navigator.clipboard?.writeText(`var(--image-${slot})`).then(() => say(`Copied var(--image-${slot})`, "right")) }) : null,
        meta ? ui.iconButton("cross", `Remove ${about.title ?? `--image-${slot}`}`, { onclick: guarded(say, () => theme.removeImage(slot)) }) : null,
      ].filter(Boolean),
    );
  };
  return item;
}

// How a background sits: each choice's value, its label, and the tokens it sets (after the prefix: --image-background
// for the main background, --image-background-<section> for a section's). null removes a token.
const BACKGROUND_CHOICES = {
  fit: [
    ["cover", "Fill the screen", { size: null, repeat: null }],
    ["contain", "Whole image", { size: "contain", repeat: "no-repeat" }],
    ["tile", "Tile", { size: "auto", repeat: "repeat" }],
  ],
  dim: [["0%", "None"], ["35%", "Light"], ["60%", "Medium"], ["80%", "Strong"]],
  blur: [["0px", "None"], ["6px", "Soft"], ["16px", "Strong"]],
  position: [["center", "Center"], ["top", "Top"], ["bottom", "Bottom"]],
};
const SAME = "same";

/**
 * The fit, dim, blur and position rows of a background. prefix is --image-background (the main one) or
 * --image-background-<section>. A section's rows start with "Same", which leaves the setting to the background the
 * section would show without its own; the main one's defaults are no token at all.
 * Returns { rows, sync(settings) }.
 */
function backgroundSettings(say, prefix, { section = false } = {}) {
  const token = (s, name) => s.look.tokens[`${prefix}-${name}`];
  const setMany = guarded(say, (changes) => {
    const tokens = { ...theme.getSettings().look.tokens };
    for (const [name, value] of Object.entries(changes)) {
      if (value === null) delete tokens[`${prefix}-${name}`];
      else tokens[`${prefix}-${name}`] = value;
    }
    sayRemoved(say, theme.setTokens(tokens));
  });
  const fitOf = (s) => {
    const [size, repeat] = [token(s, "size"), token(s, "repeat")];
    if (section && size === undefined && repeat === undefined) return SAME;
    return (repeat ?? "no-repeat") === "repeat" ? "tile" : (size ?? "cover") === "contain" ? "contain" : "cover";
  };
  // On a section, "Fill the screen" has to say so outright, or it would follow a tiled main background.
  const fits = BACKGROUND_CHOICES.fit.map(([v, l, t]) => [v, l, section && v === "cover" ? { size: "cover", repeat: "no-repeat" } : t]);
  const withSame = (options) => (section ? [[SAME, "Same"], ...options] : options);
  const valueOf = (s, name, fallback) => token(s, name) ?? (section ? SAME : fallback);
  const fit = choice({
    title: "Fit",
    options: withSame(fits.map(([v, l]) => [v, l])),
    value: fitOf(theme.getSettings()),
    onchange: (v) => setMany(v === SAME ? { size: null, repeat: null } : fits.find(([id]) => id === v)[2]),
  });
  const simple = (name, title, fallback, sub) => {
    const options = withSame(BACKGROUND_CHOICES[name]);
    const row = choice({
      title,
      sub,
      options,
      value: valueOf(theme.getSettings(), name, fallback),
      onchange: (v) => setMany({ [name]: v === SAME || (!section && v === fallback) ? null : v }),
    });
    // Five short options don't fit across a phone, and one would wrap on its own: list them, as Fit's are.
    if (options.length >= 5) row.lxGroup.classList.add("lx-segmented-stack");
    return row;
  };
  const dim = simple("dim", "Dim", "0%", "Lays the page color over it, so text stays easy to read");
  const blur = simple("blur", "Blur", "0px");
  const position = simple("position", "Position", "center");
  return {
    rows: [fit, dim, blur, position],
    sync(s) {
      fit.sync(fitOf(s));
      dim.sync(valueOf(s, "dim", "0%"));
      blur.sync(valueOf(s, "blur", "0px"));
      position.sync(valueOf(s, "position", "center"));
    },
  };
}

/** The image a section shows: its own slot, else its fallback section's (a session shows Study's), else the main one. */
function shownSlot(s, section) {
  for (const id of [section, theme.SECTION_FALLBACK[section]]) if (id && s.look.images[`background-${id}`]) return `background-${id}`;
  return s.look.images.background ? "background" : null;
}

const sectionTitle = (section) => `Background for ${section === "session" ? "study sessions" : theme.SECTIONS[section]}`;
const fallbackPhrase = (section) => (theme.SECTION_FALLBACK[section] ? `${theme.SECTIONS[theme.SECTION_FALLBACK[section]]}'s background, or the main one` : "the main background");

/** Every section, each with what shows behind it and a link to its own page (href(section)). */
function sectionList(href) {
  const list = el("ul", { part: "list" });
  list.update = (s) => {
    list.replaceChildren(
      ...Object.entries(theme.SECTIONS).map(([id, name]) => {
        const own = s.look.images[`background-${id}`];
        const shown = shownSlot(s, id);
        const url = shown ? theme.getImageUrl(shown) : null;
        const thumb = url ? el("img", { class: "ds-thumb", src: url, alt: "", "data-borrowed": own ? undefined : "" }) : el("span", { class: "ds-thumb" });
        const sub = own ? `Its own: ${own.name || own.type}` : shown === "background-study" ? "Same as Study" : shown ? "Same as the background" : "None";
        return el("li", { class: "lx-row-item" }, el("a", { part: "list-row", class: "lx-section-row", href: href(id) }, thumb, el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, name), el("span", { class: "lx-row-sub" }, sub)), icon("chevron")));
      }),
    );
  };
  return list;
}

/**
 * The Images editor: the background (with fit, dim, blur, position), the logo, and your own images. With sectionHref,
 * also every section, each linking to its own background page (sectionImageEditor).
 */
export function imageEditor({ say, compact = false, sectionHref = null }) {
  const background = imageRow(say, "background", { title: "Background", sub: theme.IMAGE_SLOTS.background });
  const mark = imageRow(say, "mark", { title: "Logo", sub: "The square beside each page's title" });
  const placement = backgroundSettings(say, "--image-background");
  const sections = sectionHref ? sectionList(sectionHref) : null;

  const custom = el("ul", { part: "list" });
  const newName = el("input", { part: "text-field", class: "ds-token-input", placeholder: "paper", spellcheck: "false", autocapitalize: "off", "aria-label": "New image name" });
  const addRow = el("li", { class: "lx-row-item" }, el("div", { part: "list-row", class: "ds-image-row lx-image-add" }, el("code", { class: "lx-small lx-muted" }, "--image-"), newName, ...imagePicker(say, () => newName.value.trim(), "Add", { after: () => (newName.value = "") })));
  const customRows = new Map();

  const stop = followAppearance((s) => {
    background.update(s);
    mark.update(s);
    for (const row of placement.rows) row.hidden = !s.look.images.background;
    placement.sync(s);
    sections?.update(s);
    const slots = Object.keys(s.look.images).filter((slot) => !(slot in theme.IMAGE_SLOTS));
    for (const [slot, row] of customRows) if (!slots.includes(slot)) (row.remove(), customRows.delete(slot));
    for (const slot of slots) {
      if (!customRows.has(slot)) customRows.set(slot, imageRow(say, slot, { sub: "" }));
      customRows.get(slot).update(s);
    }
    custom.replaceChildren(...customRows.values(), addRow);
  });
  // The Background and Logo rows name themselves; the sections and your own images are lists that need a name, said as a choice's is (no
  // headings, docs/design-bible.md); what they all mean is behind one row at the foot.
  const named = (title, ...children) => el("section", { class: "lx-group", "aria-label": title }, compact ? null : el("p", { class: "lx-choice-title" }, title), ...children);
  const node = el(
    "div",
    { class: "lx-stack" },
    ui.group(null, [background, ...placement.rows]),
    sections ? named("Each section", sections) : null,
    ui.group(null, [mark]),
    named("Your own images", custom),
    compact
      ? null
      : el(
          "ul",
          { part: "list" },
          aboutRow(
            "About images",
            ...(sections ? ["A section with a background of its own shows it in place of the one above. Study sessions show Study's when they have none."] : []),
            "Your own images go in Custom CSS as var(--image-name), for example background: var(--image-paper).",
            `They're stored on this device: PNG, JPEG, WebP, GIF, AVIF or SVG, up to ${theme.LIMITS.imageBytes / 1_000_000} MB each. Bigger photos are scaled down to fit.`,
          ),
        ),
  );
  return { node, dispose: stop };
}

/**
 * One section's background (theme.SECTIONS): its own image, and how it sits. Shows that section's background behind
 * the page while it's open, so you see what you're changing. Returns { node, title, dispose }.
 */
export function sectionImageEditor({ say, section }) {
  const slot = `background-${section}`;
  const image = imageRow(say, slot, { title: "Image", sub: `None of its own: it shows ${fallbackPhrase(section)}` });
  const placement = backgroundSettings(say, `--image-${slot}`, { section: true });
  const seeing = el("p", { part: "group-note" });
  // What Same means, beside the settings that offer it (they show once the section has an image of its own).
  const aboutSame = el("ul", { part: "list" }, aboutRow("About Same", "Same follows the background this section shows without one of its own.", "Removing the image puts its settings back to Same."));
  theme.setSection(section);
  const stop = followAppearance((s) => {
    image.update(s);
    const own = Boolean(s.look.images[slot]) || theme.BACKGROUND_SETTINGS.some((name) => `--image-${slot}-${name}` in s.look.tokens);
    for (const row of placement.rows) row.hidden = !own;
    aboutSame.hidden = !own;
    placement.sync(s);
    const shown = shownSlot(s, section);
    seeing.textContent = shown
      ? `Behind this page now: ${shown === slot ? "this background" : shown === "background" ? "the main background" : "Study's background"}, the way ${section === "session" ? "study sessions" : theme.SECTIONS[section]} will show it.`
      : "There's no background image yet: choose one here, or a main one on Images.";
  });
  const node = el(
    "div",
    { class: "lx-stack" },
    el("section", { class: "lx-group" }, el("ul", { part: "list" }, image, ...placement.rows), seeing),
    aboutSame,
  );
  return { node, title: sectionTitle(section), dispose: stop };
}

// ---------- themes ----------

const when = (ms) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const day = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Who made a theme, in words: "you", "Claude Code". */
export function madeBy(source) {
  const [via, ...rest] = String(source ?? "").split(":");
  const name = rest.join(":");
  if (via === "oauth") return name || "your AI";
  if (via === "pat" || via === "rest") return name ? `your token “${name}”` : "a token";
  return "you";
}

/** One line about a theme: "Yours · made by Claude Code, Oct 26 · starts from Paper", or a built-in one's. */
export function aboutTheme(id) {
  const yours = theme.savedTheme(id);
  if (yours) return `Yours · made by ${madeBy(yours.createdBy)}, ${day(yours.createdAt)} · starts from ${themeLabel(yours.base, theme.builtInName(yours.base))}`;
  const ready = readyTheme(id);
  if (ready?.group === "flag") return t("settings.appearance.flagFor", { languages: formatList(ready.langs.map(languageName)) });
  return theme.BUILT_IN_THEMES.find((t) => t.id === id)?.about ?? ready?.about ?? "";
}


// A look as a swatch draws it: one made from a ready-made theme sits on that theme's base, with its tokens under the look's own.
const previewLook = (look) => {
  const ready = readyTheme(look.base);
  return ready ? { ...look, base: ready.base, tokens: { ...readyTokens(ready.id), ...look.tokens } } : look;
};

/**
 * A theme's tile, built in or ready-made: a small Home in it, cropped to its top (public/themes/tiles/<id>.webp, made by
 * build-theme-tiles.mjs; Match device is Graphite and Paper split down the middle). Until the picture is here (offline, a first open, the
 * frame it decodes in) the tile is drawn from the theme's own colors at the same size, a ready-made one's backdrop too, so nothing moves
 * when it comes. A flag theme's tile has its flag as its mark, in the corner where Home has the flag of the language you're learning (the
 * picture leaves that one out: it's the sample learner's, not the theme's).
 */
// A ready-made tile's stand-in draws with its canvas, its edge and its backdrop alone (theme-presets.js readyStandIn), not the whole theme: a
// page of 70 flags worked out 70 themes and styled 70 sets of 52 tokens, 510 ms at 4×.
function homeSwatch({ id, name }, { selected, onclick }) {
  const ready = readyTheme(id);
  const tokens = ready ? readyStandIn(id) : null;
  const drawn = tokens && { "--canvas": tokens["--canvas"], "--hair": tokens["--hair"] };
  const swatch = ui.themeSwatch({ id, name: ready ? tileName(ready) : name, selected, onclick, look: ready ? { base: ready.base, tokens: drawn } : null });
  // A ready-made one is drawn as a look is, but isn't one of yours: its own variant.
  if (ready) swatch.setAttribute("data-variant", "ready");
  const screen = swatch.querySelector(".lx-swatch-screen");
  // Every color its stand-in draws with is on it already: without its base's whole token block (tokens.css [data-theme-preview]) each tile is
  // cheap to style.
  if (ready) screen.removeAttribute("data-theme-preview");
  // Its stand-in is its canvas and backdrop alone: the generic card and dots would be covered by Home's picture anyway, and 70 flags' worth of
  // them made the flags page's open twice Appearance's.
  if (ready) screen.replaceChildren();
  screen.setAttribute("data-home-tile", "");
  // The backdrop, as the page draws it (the swatch leaves --image-* tokens out: a look's are images by hash).
  if (tokens?.["--image-background"]) screen.style.setProperty("--swatch-backdrop", tokens["--image-background"]);
  // The picture's place is held from the tile's first frame (ui.held, drawing nothing over the stand-in), and the picture arrives in it once
  // it's decoded (ui.arriveIn): fading in when the tile is on the screen, at once on a page still being drawn, never in one frame.
  screen.append(arriving(el("img", { class: "lx-swatch-picture", alt: "", "aria-hidden": "true", loading: "lazy", decoding: "async", src: `/themes/tiles/${id}.webp` }), "picture", "lx-swatch-picture-place"));
  // A flag theme's mark, over the picture: its flag, held in its exact shape from the first frame (a quiet fill) and arriving the same way.
  if (ready?.group === "flag") {
    const mark = ui.languageFlag(ready.langs[0]);
    if (mark) {
      mark.classList.add("lx-swatch-flag");
      mark.setAttribute("aria-hidden", "true");
      screen.append(arriving(mark, "flag", "lx-swatch-flag-place", ready.base === "graphite" ? "dark" : "light"));
    }
  }
  return swatch;
}
// An image of a tile in a held place (ui.held) that it arrives in once decoded (ui.arriveIn), or leaves empty if it can't load.
function arriving(img, holds, placeClass, scheme) {
  const place = ui.held({}, holds);
  place.classList.add(placeClass);
  if (scheme) place.dataset.scheme = scheme;
  img.addEventListener(
    "load",
    () =>
      img
        .decode()
        .catch(() => {})
        .then(() => {
          if (!img.isConnected) return;
          img.setAttribute("data-loaded", "");
          ui.arriveIn(place, img);
        }),
    { once: true },
  );
  img.addEventListener("error", () => img.remove(), { once: true });
  place.append(img);
  return place;
}

/** A swatch for one of your themes, drawn with its background once its image URL is ready; at a Home tile's size, so the grid stays even. */
const sized = (swatch) => (swatch.querySelector(".lx-swatch-screen").setAttribute("data-home-tile", ""), swatch);
function savedSwatch(entry, { selected, onclick }) {
  const swatch = sized(ui.themeSwatch({ id: entry.id, name: entry.name, selected, onclick, look: previewLook(entry.look) }));
  const hash = entry.look.images?.background?.hash;
  if (hash) {
    theme.imageUrl(hash).then((url) => {
      if (!url || !swatch.isConnected) return;
      swatch.replaceWith(sized(ui.themeSwatch({ id: entry.id, name: entry.name, selected: swatch.getAttribute("aria-pressed") === "true", onclick, look: previewLook(entry.look), imageUrl: url })));
    });
  }
  return swatch;
}

/**
 * Picking a theme: the built-in ones, then yours, each drawn in its own colors. A press switches to it (the one you
 * leave stays as it was). tinta: Tinta on the page (Settings → Appearance), from under which the new theme spreads as
 * it shakes itself (character/theme-wipe.js, loaded with the page; until it has, the theme just changes). Returns
 * { node, dispose }.
 */
/**
 * Picking a theme. Two parts, placed apart by Settings → Appearance: node, the built-in themes and yours with a line about the one in
 * use (under the Theme label, beside Tinta); more, the ready-made ones (lx/theme-presets.js) as a group of their own, further down.
 */
export function themePicker({ say, tinta = null }) {
  const node = el("div", { class: "lx-theme-picker" });
  const more = el("section", { class: "lx-group lx-theme-picker lx-theme-more" });
  const note = el("p", { part: "group-note" });
  let wipe = null;
  if (tinta) import("../character/theme-wipe.js").then((m) => (wipe = m.wipeTheme), () => {});
  const render = () => {
    const inUse = theme.themeInUse();
    // The new theme spreads from under Tinta (beside the Theme label); with Tinta off the screen (scrolled down to the ready-made themes)
    // the wipe just changes the theme (character/theme-wipe.js).
    const pick = (id) => guarded(say, () => (wipe && tinta?.isConnected ? wipe(() => theme.useTheme(id), tinta) : theme.useTheme(id)));
    const yours = theme.themes();
    const general = READY_THEMES.filter((one) => one.group === "general");
    const moreTitle = t("settings.appearance.more");
    const flag = flagThemeOf(learning());
    // The language's own motif (its drawn picture), where it has an honest one, beside its flag's.
    const motif = motifThemeOf(learning());
    const ownThemes = [motif, flag].filter(Boolean);
    const forTitle = t("settings.appearance.forLanguage", { language: learningName() });
    const flagCount = READY_THEMES.filter((one) => one.group === "flag").length;
    node.replaceChildren(
      el(
        "div",
        { class: "lx-swatches", role: "group", "aria-label": "Built-in themes" },
        theme.BUILT_IN_THEMES.map((one) => homeSwatch(one, { selected: inUse.kind === "built-in" && inUse.id === one.id, onclick: pick(one.id) })),
      ),
      ...(yours.length
        ? [
            el("h3", { class: "lx-swatch-label" }, "Yours"),
            el("div", { class: "lx-swatches", role: "group", "aria-label": "Your themes" }, yours.map((entry) => savedSwatch(entry, { selected: entry.inUse, onclick: pick(entry.id) }))),
          ]
        : []),
      note,
    );
    note.textContent = aboutTheme(inUse.id);
    // The ready-made themes, each its own idea, drawn as a small Home in it.
    // The language you're learning's own first (its motif's theme and its flag's), with the way to every flag's; then the general ones.
    more.replaceChildren(
      ...(ownThemes.length
        ? [
            el("p", { class: "lx-choice-title" }, forTitle),
            el("div", { class: "lx-swatches lx-ready-swatches", role: "group", "aria-label": forTitle }, ownThemes.map((one) => homeSwatch(one, { selected: inUse.kind === "built-in" && inUse.id === one.id, onclick: pick(one.id) }))),
          ]
        : []),
      el("ul", { part: "list", class: "lx-theme-flags-row" }, ui.listRow({ title: t("settings.appearance.allFlags"), value: String(flagCount), href: "#settings/appearance/flags" })),
      el("p", { class: "lx-choice-title" }, moreTitle),
      el("div", { class: "lx-swatches lx-ready-swatches", role: "group", "aria-label": moreTitle }, general.map((one) => homeSwatch(one, { selected: inUse.kind === "built-in" && inUse.id === one.id, onclick: pick(one.id) }))),
    );
  };
  render();
  // Redrawn when the theme in use or your themes change; not for every color you drag.
  let shown = "";
  const stop = theme.onChange((_, change) => {
    const key = JSON.stringify([theme.themeInUse(), theme.themes().map((t) => [t.id, t.name, t.base, t.updatedAt])]);
    if (key === shown && !["switch", "library", "library-sync", "remote", "restore", "import", "other-tab"].includes(change?.kind)) return;
    shown = key;
    render();
  });
  return { node, more, dispose: stop };
}

/**
 * Every flag's theme (Settings → Appearance → All flags), by its place's name, each the same small Home as the others: the whole grid in
 * its first frame, every tile holding its place drawn from the theme's tokens until its picture fades in. A press switches to it; there's no
 * Tinta here, so the theme just changes. Returns { node, dispose }.
 */
export function flagPicker({ say }) {
  const node = el("div", { class: "lx-theme-picker" });
  const note = el("p", { part: "group-note" });
  const flags = READY_THEMES.filter((one) => one.group === "flag");
  const title = t("settings.appearance.flagsTitle");
  const swatches = new Map();
  const render = () => {
    const inUse = theme.themeInUse();
    for (const one of flags) {
      const on = inUse.kind === "built-in" && inUse.id === one.id;
      const swatch = swatches.get(one.id) ?? homeSwatch(one, { selected: on, onclick: guarded(say, () => theme.useTheme(one.id)) });
      swatch.setAttribute("aria-pressed", String(on));
      swatches.set(one.id, swatch);
    }
    note.textContent = flags.some((one) => one.id === inUse.id) ? aboutTheme(inUse.id) : "";
  };
  render();
  node.append(el("div", { class: "lx-swatches lx-ready-swatches", role: "group", "aria-label": title }, [...swatches.values()]), note);
  const stop = theme.onChange(() => render());
  return { node, dispose: stop };
}

/** Your themes as a list, each a link to its own page (href(id)). Returns { node, dispose }. */
export function themeList({ href }) {
  const list = el("ul", { part: "list", class: "lx-theme-list" });
  const render = () => {
    const yours = theme.themes();
    list.replaceChildren(
      ...(yours.length
        ? yours.map((entry) => {
            const item = ui.listRow({
              title: entry.name,
              sub: `Made by ${madeBy(entry.createdBy)}, ${day(entry.createdAt)} · starts from ${themeLabel(entry.base, theme.builtInName(entry.base))} · ${theme.describeLook(entry.look)}`,
              value: entry.inUse ? "In use" : undefined,
              href: href(entry.id),
            });
            // A small preview of it, where a row's icon goes.
            const preview = el("span", { class: "lx-row-icon lx-row-swatch", "aria-hidden": "true" });
            const draw = (url) => preview.replaceChildren(ui.themeSwatch({ id: entry.id, name: "", look: entry.look, imageUrl: url }).querySelector(".lx-swatch-screen"));
            draw(null);
            const hash = entry.look.images?.background?.hash;
            if (hash) theme.imageUrl(hash).then((url) => url && draw(url));
            item.querySelector('[data-part="list-row"]').prepend(preview);
            return item;
          })
        : [
            // None yet: an empty state, Tinta in its pose beside the words (every empty state has it; the page's only one).
            el("li", { class: "lx-row-item lx-themes-empty" }, ui.emptyState("None yet. Change any color, CSS or image, and it's kept here as a theme of yours.", { pose: "page" })),
          ]),
    );
  };
  render();
  const stop = theme.onChange((_, change) => ["switch", "library", "library-sync", "remote", "name", "theme", "import", "restore", "other-tab"].includes(change?.kind) && render());
  return { node: list, dispose: stop };
}

/**
 * One of your themes: use it, its name, the built-in theme it starts from, what to edit, duplicate, export, clear and
 * delete. href(page) makes a link to an editor ("colors", "css", "images"); onDuplicated(id) and onDeleted(result)
 * say what to do after. Returns { node, title, dispose }, or null if it isn't on this device.
 */
export function themeDetails({ id, say, href, onDuplicated, onDeleted }) {
  if (!theme.savedTheme(id)) return null;
  const node = el("div", { class: "lx-stack" });
  const nameField = el("input", { part: "text-field", "aria-label": "Theme name", maxlength: "80" });
  nameField.addEventListener("change", guarded(say, () => theme.renameTheme(id, nameField.value)));
  const base = choice({
    title: "Starts from",
    sub: "The built-in theme under its colors, CSS and images",
    options: theme.BUILT_IN_THEMES.map((t) => [t.id, t.name]),
    value: theme.savedTheme(id).base,
    onchange: guarded(say, (value) => theme.setThemeBase(id, value)),
  });
  const preview = el("div", { class: "lx-theme-preview" });
  const use = el("div", { class: "ds-states" });
  const sub = el("p", { class: "lx-small lx-muted" });
  // Editing switches to it first, so you see what you change.
  const edit = (page) => async (event) => {
    event.preventDefault();
    try {
      if (!theme.savedTheme(id)?.inUse) await theme.useTheme(id);
      location.hash = href(page);
    } catch (error) {
      say(error.message, "wrong");
    }
  };
  const editRows = ui.group(null, [
    ui.listRow({ icon: "palette", title: "Colors", onclick: edit("colors") }),
    ui.listRow({ icon: "pencil", title: "Custom CSS", onclick: edit("css") }),
    ui.listRow({ icon: "upload", title: "Images", onclick: edit("images") }),
  ]);
  const editNote = el("p", { part: "group-note" });
  editRows.append(editNote);
  const exportRow = ui.listRow({
    icon: "download",
    title: "Export a theme file",
    sub: "One file with its colors, CSS and images, to share or keep",
    onclick: guarded(say, async () => {
      const entry = theme.savedTheme(id);
      const blob = await theme.exportSavedTheme(id);
      const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-theme";
      const url = URL.createObjectURL(blob);
      const link = el("a", { href: url, download: `${slug}.lexicommons-theme.json` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      say(`Exported ${slug}.lexicommons-theme.json (${kb(blob.size)})`, "right");
    }),
  });
  const actions = ui.group(null, [
    ui.listRow({
      icon: "copy",
      title: "Duplicate",
      sub: "A copy to change, leaving this one as it is",
      onclick: guarded(say, () => onDuplicated?.(theme.duplicateTheme(id))),
    }),
    exportRow,
  ]);
  const clearRow = twoStep({
    icon: "refresh",
    title: "Clear its colors, CSS and images",
    sub: "It stays a theme of yours, as its built-in theme comes; Undo brings them back",
    confirm: "Press again to clear them",
    action: guarded(say, async () => {
      if (!theme.savedTheme(id)?.inUse) await theme.useTheme(id);
      await theme.resetLook();
      say("Cleared. Undo it from the message at the bottom, or from Recent looks.", "right");
    }),
  });
  const deleteRow = twoStep({
    icon: "trash",
    title: "Delete this theme",
    sub: "If it's in use, the built-in theme it starts from takes its place",
    confirm: "Press again to delete it",
    action: guarded(say, async () => onDeleted?.(await theme.deleteTheme(id))),
  });
  node.append(preview, sub, use, el("label", { part: "field" }, el("span", {}, "Name"), nameField), el("section", { class: "lx-group" }, el("ul", { part: "list" }, base)), editRows, actions, ui.group(null, [clearRow, deleteRow]));
  const render = () => {
    const entry = theme.savedTheme(id);
    if (!entry) return;
    if (document.activeElement !== nameField) nameField.value = entry.name;
    base.sync(entry.base);
    sub.textContent = aboutTheme(id);
    preview.replaceChildren(savedSwatch(entry, { selected: entry.inUse, onclick: guarded(say, () => theme.useTheme(id)) }));
    use.replaceChildren(
      entry.inUse
        ? el("p", { class: "lx-row lx-small lx-muted" }, icon("check"), "In use")
        : ui.button("Use this theme", { variant: "white", size: "sm", onclick: guarded(say, () => theme.useTheme(id)) }),
    );
    editNote.textContent = entry.inUse ? "Changes save to this theme." : "Editing switches to it first.";
  };
  render();
  const stop = theme.onChange(() => render());
  return { node, title: theme.savedTheme(id).name, dispose: stop };
}

/** A row that does something destructive: the first press asks, a second within a few seconds does it. */
function twoStep({ icon: iconName, title, sub, confirm, action }) {
  let armed = null;
  const item = ui.listRow({
    icon: iconName,
    title,
    sub,
    variant: "danger",
    trailing: el("span"),
    onclick: async () => {
      const row = item.querySelector('[data-part="list-row"]');
      const titleNode = row.querySelector(".lx-row-title");
      if (!armed) {
        titleNode.textContent = confirm;
        row.setAttribute("data-armed", "");
        armed = setTimeout(() => {
          armed = null;
          titleNode.textContent = title;
          row.removeAttribute("data-armed");
        }, 5000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      titleNode.textContent = title;
      row.removeAttribute("data-armed");
      await action();
    },
  });
  return item;
}

/** Importing a theme file: it's checked and shown first, then added to your themes and put in use. Returns { node }. */
export function importTheme({ say, onAdded }) {
  const preview = el("div");
  const input = el("input", { type: "file", accept: "application/json,.json", hidden: true });
  input.addEventListener(
    "change",
    guarded(say, async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const parsed = await theme.readThemeFile(file);
      const imageNames = Object.keys(parsed.images);
      preview.replaceChildren(
        el(
          "div",
          { part: "card", class: "lx-stack" },
          el("strong", {}, parsed.name),
          el(
            "p",
            { class: "lx-small lx-muted" },
            `Starts from ${themeLabel(parsed.base, theme.builtInName(parsed.base))} · ${Object.keys(parsed.tokens).length} tokens · ${(parsed.css.length / 1000).toFixed(1)} KB of CSS · ${imageNames.length ? `images: ${imageNames.join(", ")}` : "no images"}`,
          ),
          ...parsed.notes.map((note) => el("p", { class: "lx-tiny lx-muted" }, note)),
          el("p", { class: "lx-tiny lx-muted" }, "It's added to your themes and put in use. None of your other themes change, and your text and layout settings stay."),
          el(
            "div",
            { class: "ds-states" },
            ui.button("Add and use it", {
              variant: "white",
              size: "sm",
              onclick: guarded(say, async () => {
                const undo = await theme.applyThemeFile(parsed);
                preview.replaceChildren();
                say(`Added ${theme.themeInUse().name} to your themes, and it's in use`, "right");
                onAdded?.(undo);
              }),
            }),
            ui.button("Cancel", { variant: "fade", size: "sm", onclick: () => preview.replaceChildren() }),
          ),
        ),
      );
    }),
  );
  return { node: el("div", { class: "lx-stack" }, input, ui.button("Import a theme file", { variant: "go", size: "lg", block: true, onclick: () => input.click() }), preview), input };
}

// ---------- sharing and recent looks ----------

/**
 * The theme in use's name, exporting it, and importing a theme file as a new theme (with a preview before anything
 * changes). A name on a built-in theme starts a theme of yours with it. Returns { node, dispose }.
 */
export function shareEditor({ say, onApplied }) {
  const nameField = el("input", { part: "text-field", placeholder: "My theme", "aria-label": "Theme name" });
  nameField.value = theme.getSettings().look.name;
  nameField.addEventListener("change", guarded(say, () => theme.setLookName(nameField.value.trim())));
  const importer = importTheme({ say, onAdded: (undo) => onApplied?.(undo, theme.themeInUse().name) });
  const exportTheme = guarded(say, async () => {
    const blob = await theme.exportTheme(nameField.value.trim() || undefined);
    const slug = (nameField.value.trim() || "my-theme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-theme";
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: `${slug}.lexicommons-theme.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say(`Exported ${slug}.lexicommons-theme.json (${kb(blob.size)})`, "right");
  });
  const stop = theme.onChange((s) => {
    if (document.activeElement !== nameField) nameField.value = s.look.name;
  });
  return {
    node: el(
      "div",
      { class: "lx-stack" },
      el("label", { part: "field" }, el("span", {}, "Name"), nameField),
      el("div", { class: "ds-states" }, ui.button("Export", { size: "sm", icon: "download", onclick: exportTheme })),
      importer.node,
      el("p", { class: "lx-tiny lx-muted" }, "A theme file carries a theme (its colors, CSS and images, and the built-in theme it starts from), never your text and layout settings."),
    ),
    dispose: stop,
  };
}

const BEFORE = {
  tokens: "Before color changes",
  theme: "Before its built-in theme changed",
  name: "Before it was renamed",
  css: "Before a CSS change",
  image: "Before an image change",
  reset: "Before you started over",
  import: "Before importing",
  restore: "Before restoring a look",
  remote: "Before your AI's change",
};

/** Recent looks: the last 20 looks you replaced, newest first, each one a press away. Returns { node, dispose }. */
export function recentLooks({ say, onRestored } = {}) {
  const list = el("ul", { part: "list", class: "lx-recent-looks" });
  let rendering = 0;
  const render = async () => {
    const mine = ++rendering;
    const entries = await theme.getHistory();
    if (mine !== rendering) return;
    list.replaceChildren(
      ...(entries.length
        ? entries.map((entry) =>
            ui.listRow({
              title:
                entry.kind === "import" && entry.label
                  ? `Before importing ${entry.label}`
                  : entry.kind === "switch" && entry.label
                    ? `Before switching to ${entry.label}`
                  : entry.kind === "remote" && entry.label
                    ? entry.label === "another device"
                      ? "Before a change on another device"
                      : `Before a change by ${entry.label}`
                    : BEFORE[entry.kind] ?? "An earlier look",
              sub: `${when(entry.at)} · ${entry.look.theme ? entry.look.name || "a theme of yours" : themeLabel(entry.look.base, theme.builtInName(entry.look.base))} · ${theme.describeLook(entry.look)}`,
              trailing: ui.button("Restore", {
                size: "sm",
                onclick: guarded(say, async () => {
                  const undo = await theme.restoreLook(entry.id);
                  say("Restored. The look it replaced is at the top of this list.", "right");
                  onRestored?.(undo);
                }),
              }),
            }),
          )
        : [el("li", { part: "list-row", class: "lx-row-empty" }, el("span", { class: "lx-row-text lx-muted" }, "Nothing yet. Each time you change your look, the one it replaced is kept here."))]),
    );
  };
  render();
  // Snapshots are written just after a change, so look again a moment later.
  const stop = theme.onChange((_, change) => change?.kind !== "preset" && setTimeout(render, 150));
  return { node: list, refresh: render, dispose: stop };
}

/** "Reset look" with a second press to confirm (no browser dialogs). */
function resetButton(say) {
  let armed = null;
  return ui.button("Reset look", {
    variant: "danger",
    size: "sm",
    onclick: guarded(say, async (event) => {
      const b = event.currentTarget;
      if (!armed) {
        b.lastChild.textContent = "Tap again to reset";
        armed = setTimeout(() => {
          armed = null;
          b.lastChild.textContent = "Reset look";
        }, 4000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      b.lastChild.textContent = "Reset look";
      const undo = await theme.resetLook();
      say(undo ? "Look reset: colors, CSS and images cleared. The old look is in Recent looks." : "Nothing to reset: this is a built-in theme as it comes.", "right");
    }),
  });
}

// ---------- the /design page's panel ----------

/** The /design page's panel: every control, in one column. */
export function buildAppearance(root) {
  root.classList.add("ds-appearance");
  const status = statusLine();
  const say = status.say;
  const segment = (pressed, onclick, ...children) =>
    el("button", { part: "segment", type: "button", "aria-pressed": String(pressed), onclick: guarded(say, onclick) }, ...children);
  const initial = theme.getSettings();
  const builtInInUse = (s, id) => !s.look.theme && s.theme === id;
  const themeButtons = new Map(
    theme.BUILT_IN_THEMES.map((t) => [t.id, segment(builtInInUse(initial, t.id), () => theme.useTheme(t.id), el("strong", {}, t.name), el("span", { class: "lx-tiny lx-muted" }, t.about))]),
  );
  // Your themes, to switch to (made and changed in the app's Settings → Appearance).
  const yours = el("div", { part: "segmented", class: "ds-themes ds-your-themes", role: "group", "aria-label": "Your themes" });
  const renderYours = (s) => {
    const list = theme.themes();
    yours.hidden = !list.length;
    yours.replaceChildren(
      ...list.map((t) => segment(s.look.theme === t.id, () => theme.useTheme(t.id), el("strong", {}, t.name), el("span", { class: "lx-tiny lx-muted" }, `Starts from ${themeLabel(t.base, theme.builtInName(t.base))}`))),
    );
  };
  renderYours(initial);
  // The built-in theme the theme in use starts from.
  const baseButtons = new Map(theme.BUILT_IN_THEMES.map((t) => [t.id, segment(initial.theme === t.id, () => theme.setBase(t.id), t.name)]));
  const presetButtons = Object.entries(theme.PRESETS).map(([name, preset]) => [
    name,
    new Map(preset.options.map(([value, label]) => [value, segment(initial.presets[name] === value, () => theme.setPreset(name, value), label)])),
  ]);
  const presetField = ([name, buttons]) =>
    el("div", { part: "field" }, el("span", {}, theme.PRESETS[name].label), el("div", { part: "segmented", role: "group", "aria-label": theme.PRESETS[name].label }, [...buttons.values()]));
  theme.onChange((s) => {
    for (const [id, button] of themeButtons) button.setAttribute("aria-pressed", String(builtInInUse(s, id)));
    for (const [id, button] of baseButtons) button.setAttribute("aria-pressed", String(id === s.theme));
    renderYours(s);
    for (const [name, buttons] of presetButtons) for (const [value, button] of buttons) button.setAttribute("aria-pressed", String(s.presets[name] === value));
  });
  const colours = colourEditor({ say, groups: ["Page", "Text", "Main button", "Meaning"], compact: true });
  const css = cssEditor({ say });
  const images = imageEditor({ say, compact: true });
  const share = shareEditor({ say });
  const recent = recentLooks({ say });
  const group = (title, ...children) => el("section", { class: "ds-group" }, el("h3", { class: "ds-group-title lx-tiny" }, title), ...children);
  root.replaceChildren(
    ...(theme.isPersisted() ? [] : [ui.feedback("slipping", "Not saved", "This browser won't let the page save, so changes last for this visit only.")]),
    status,
    group("Animations", presetField(presetButtons.find(([name]) => name === "motion")), el("p", { class: "lx-tiny lx-muted" }, "Off makes everything instant. Animations never hold you up either way: tap anywhere and they finish.")),
    group("Theme", el("div", { part: "segmented", class: "ds-themes", role: "group", "aria-label": "Theme" }, [...themeButtons.values()]), yours),
    group("Starts from", el("div", { part: "segmented", role: "group", "aria-label": "Starts from" }, [...baseButtons.values()]), el("p", { class: "lx-tiny lx-muted" }, "The built-in theme under the theme in use. Changing a built-in theme starts a theme of yours.")),
    group("Layout", el("div", { class: "lx-stack" }, ...presetButtons.filter(([name]) => name !== "motion").map(presetField))),
    group("Colors", colours.node, el("p", { class: "lx-tiny lx-muted" }, "Every color, with readability warnings, is in the app: Settings → Appearance → Colors.")),
    group("Custom CSS", css.node, el("p", { class: "lx-tiny lx-muted" }, "Saved on this device. Outside links and @import are removed; images come from Images as var(--image-name).")),
    group("Images", images.node),
    group("Share", share.node),
    group("Recent looks", recent.node),
    group("Start over", resetButton(say)),
  );
}

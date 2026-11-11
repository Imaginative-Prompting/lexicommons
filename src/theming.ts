// What an AI needs to restyle the app well: the theming surface (every part and its states), every token with its
// value under each built-in theme, the rules a look follows, and (if asked) the app's own CSS. Built from the app's
// real files, so it can't drift from them: parts.js and look-rules.js are imported, and the token values are read
// from the deployed tokens.css.

import { PARTS, STATE_ATTRIBUTES, THEMING_SURFACE_VERSION } from "../public/js/lx/parts.js";
import { BACKGROUND_SETTINGS, BASE_THEMES, IMAGE_SLOTS, IMAGE_TYPES, LOOK_LIMITS, SECTION_FALLBACK, SECTIONS, TOKEN_GUIDE } from "../public/js/lx/look-rules.js";
import type { Env } from "./env";
import { LOOK_IMAGE_BYTES_PER_ACCOUNT } from "./looks";

/** The app's stylesheets an AI can ask to read, by name. */
export const APP_CSS = {
  tokens: "/css/lx/tokens.css",
  base: "/css/lx/base.css",
  components: "/css/lx/components.css",
  presets: "/css/lx/presets.css",
  shell: "/css/shell.css",
  practice: "/css/lx/practice.css",
} as const;
export type AppCssName = keyof typeof APP_CSS;

const THEMES = ["graphite", "paper", "contrast", "sepia"] as const;

async function assetText(env: Env, path: string): Promise<string> {
  const response = await env.ASSETS.fetch(new Request(new URL(path, env.PUBLIC_ORIGIN)));
  if (!response.ok) throw new Error(`asset ${path}: ${response.status}`);
  return response.text();
}

/**
 * Every token in tokens.css with its value under each built-in theme. The Graphite block also applies to :root, so
 * it's the base every other theme overrides ("auto" is Graphite in dark mode and Paper in light).
 */
export function tokenValues(css: string): Record<string, Record<(typeof THEMES)[number], string>> {
  const blocks: Record<string, Record<string, string>> = { common: {}, graphite: {}, paper: {}, contrast: {}, sepia: {} };
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]!.trim();
    const name = /data-theme="(graphite|paper|contrast|sepia)"/.exec(selector)?.[1] ?? (selector === ":root" ? "common" : null);
    if (!name) continue;
    for (const declaration of match[2]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) blocks[name]![declaration[1]!] = declaration[2]!.trim().replace(/\s+/g, " ");
  }
  const names = new Set(Object.values(blocks).flatMap((block) => Object.keys(block)));
  const out: Record<string, Record<(typeof THEMES)[number], string>> = {};
  for (const token of names) {
    const value = (theme: string) => blocks[theme]![token] ?? blocks.graphite![token] ?? blocks.common![token] ?? "";
    out[token] = { graphite: value("graphite"), paper: value("paper"), contrast: value("contrast"), sepia: value("sepia") };
  }
  return out;
}

const HOW_IT_WORKS = [
  "A look is a base theme, token overrides, custom CSS and images. update_look changes it. The person's app picks the change up within a few seconds while it's open, or the next time it opens. Every device they use follows the same look.",
  "Themes: every look that changes anything is saved as a theme of the person's own, with a name, and they pick between their themes and the built-in ones (graphite, paper, auto, contrast, sepia) in Settings → Appearance. update_look and request_look_image_upload change the theme in use; on a built-in theme they start a new theme of the person's first, because built-in themes never change. list_themes shows them all, use_theme switches (no theme changes), and create_theme makes a new one and switches to it.",
  "When the person asks for a new look (\"make my Lexicommons look like X\"), call create_theme first, named for what it is, then build it with update_look: their other themes stay as they are and they can switch back any time. When they ask to change the look they have (\"darker blue\", \"rounder cards\"), change the theme in use. Never change or switch away from a theme they didn't ask about without saying so.",
  "The app's CSS sits in cascade layers and a look's tokens and CSS are unlayered, so they always win, whatever their specificity. Plain selectors work: no !important, no long selectors.",
  'Style parts by [data-part="…"] and their attributes (data-state, data-meaning, data-variant, data-size, data-level, data-order), never by class names. Parts are a stable surface; classes can change in any release.',
  "Prefer tokens to CSS for colors. Change --canvas, --well, --ink-1, --m-right and so on, and every part follows. Setting --m-right, --m-wrong or --m-slipping also mixes its -bg tint and -edge (unless you set those too).",
  "Meaning (right, wrong, slipping, new, hint, moved) never rests on color alone: every part that shows one also shows an icon, a word or a mark. Recolor them freely, but keep those marks visible. Keep right and wrong easy to tell apart for color-blind people: blue and orange work; red and green don't.",
  "Images: request_look_image_upload gives a signed link for a slot. Once the file is uploaded it's in the look as var(--image-<slot>). background and mark (the header's logo square) are built in; any other slot is yours to use from CSS.",
  "The background image: --image-background-size (cover, contain or auto for tiles), --image-background-repeat, --image-background-position, --image-background-dim (how much of the page color lies over it, 0% to 90%; raise it until text reads easily), and --image-background-blur (0px to 24px).",
  "Sections can each have their own background (see sections): put an image in slot background-<section> and it shows in that section in place of 'background'. --image-background-<section>-size, -repeat, -position, -dim and -blur set how it sits; any you leave out follow the main --image-background-* ones. A study session with no background-session shows Study's. The app marks the section on <html> as data-section, so CSS can tell sections apart too (:root[data-section=\"read\"] …).",
  "Personal settings are the person's own, and a look never sets them: data-text (s, m, l, xl), data-density, data-card, data-reader and data-motion on <html>. A look's CSS can respond to them.",
  "Light and dark: base 'auto' follows the device. A look's tokens apply in both, so to differ use @media (prefers-color-scheme: light) { :root { … } } in the CSS. Or pick graphite, paper, contrast or sepia as the base.",
  "Fonts: only fonts on the person's device (system font stacks) or fonts embedded as data: URLs. Nothing loads from other servers.",
  "Bars: the app header is a band the width of the screen in --canvas, and the tab bar is --chrome. Recolor them with those tokens rather than with a background in CSS, so the band stays one color edge to edge.",
  "The app checks every look it receives. A look that hides the header, the page, the tabs or the way into Settings, or makes the text the color of the page, is undone on the device, and get_look reports that under lastApplied.undone. The person can also undo any change with one tap.",
  "After update_look, call get_look a few seconds later. lastApplied says whether a device has applied the revision, and what its check left out.",
];

const SAFETY = [
  "url() is kept only for data: images (png, jpeg, webp, gif, avif, svg) and data: fonts; every other url() becomes none",
  "@import is removed",
  "image-set(), src() and expression() are removed",
  "-moz-binding, behavior and javascript: are removed",
  "CSS escapes are decoded first, so nothing can be spelled around these checks",
  "Comments are removed",
];

const EXAMPLES = [
  { what: "Warm dark colors", tokens: { "--canvas": "#14110e", "--well": "#1f1a15", "--ink-1": "#f3e9dc", "--m-right": "#6cb4ee" } },
  { what: "Rounder study cards with a thicker edge", css: '[data-part="study-card"] { border-radius: 32px; border-width: 2px; }' },
  { what: "Moved words in a bolder highlight", css: '[data-part="literal-chunk"][data-state="moved"] { font-weight: 600; }' },
  { what: "A light variant of your colors when the device is light", css: "@media (prefers-color-scheme: light) { :root { --canvas: #fbf7f1; --ink-1: #241d14; } }" },
];

/** The whole guide. include = names from APP_CSS whose text to add. */
export async function themingGuide(env: Env, include: AppCssName[] = []) {
  const tokensCss = await assetText(env, APP_CSS.tokens);
  const values = tokenValues(tokensCss);
  const described = new Map(TOKEN_GUIDE.map((t) => [t.name, t]));
  const tokens = Object.entries(values).map(([name, byTheme]) => ({
    name,
    ...(described.get(name) ? { group: described.get(name)!.group, label: described.get(name)!.label } : {}),
    values: byTheme,
  }));
  const appCss: Record<string, string> = {};
  for (const name of include) appCss[name] = await assetText(env, APP_CSS[name]);
  return {
    surface: THEMING_SURFACE_VERSION,
    howItWorks: HOW_IT_WORKS,
    baseThemes: BASE_THEMES,
    limits: {
      cssBytes: LOOK_LIMITS.cssBytes,
      tokens: LOOK_LIMITS.tokenCount,
      tokenValueChars: LOOK_LIMITS.tokenValueLength,
      images: LOOK_LIMITS.imageCount,
      imageBytes: LOOK_LIMITS.imageBytes,
      imageBytesPerAccount: LOOK_IMAGE_BYTES_PER_ACCOUNT,
      imageTypes: IMAGE_TYPES,
    },
    safetyCheck: SAFETY,
    imageSlots: IMAGE_SLOTS,
    sections: {
      names: SECTIONS,
      attribute: "data-section on <html>, while the app shows that section (session only while Settings previews a session's background; a study session itself is [data-part=\"session\"])",
      imageSlot: "background-<section>",
      settingTokens: BACKGROUND_SETTINGS.map((name) => `--image-background-<section>-${name}`),
      fallsBackTo: { ...SECTION_FALLBACK, "*": "background" },
    },
    personalSettings: {
      "data-text": ["m", "s", "l", "xl"],
      "data-density": ["comfortable", "compact", "spacious"],
      "data-card": ["filled", "outlined", "flat"],
      "data-reader": ["pages", "scroll"],
      "data-motion": ["system", "on", "off"],
    },
    stateAttributes: STATE_ATTRIBUTES,
    parts: PARTS,
    tokens,
    examples: EXAMPLES,
    ...(include.length ? { appCss } : {}),
  };
}

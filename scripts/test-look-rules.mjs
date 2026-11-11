// Tests the look rules (public/js/lx/look-rules.js) that the app, the server and MCP all use: checking a look,
// applying an AI's change to it, merging two devices' changes, comparing looks, and saved themes (which theme a look
// is, what counts as a change, naming new themes).
// Usage: node scripts/test-look-rules.mjs   (exit 0 = pass)

import {
  BACKGROUND_SETTINGS,
  BASE_THEMES,
  BUILT_IN_THEMES,
  builtInName,
  canonicalLook,
  checkLook,
  checkTokens,
  copyName,
  describeLook,
  editedName,
  emptyLook,
  hasChanges,
  IMAGE_SLOTS,
  LookError,
  mergeLooks,
  newThemeId,
  patchLook,
  sameContent,
  sameLook,
  SECTION_FALLBACK,
  SECTIONS,
  SLOT_NAME,
  THEME_ID,
  themeContent,
  uniqueName,
} from "../public/js/lx/look-rules.js";
import { READY_IDS } from "../public/js/lx/theme-presets.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} expected ${e}, got ${a}`);
};
const ok = (condition, what) => {
  if (!condition) throw new Error(what);
};

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const image = (hash, name = "x.png") => ({ hash, type: "image/png", size: 1000, name });

// ---------- checking ----------

test("tokens: well-formed ones are kept, trimmed", () => {
  eq(checkTokens({ "--canvas": "  #101010 ", "--radius-24": "32px" }).tokens, { "--canvas": "#101010", "--radius-24": "32px" });
});
test("tokens: bad names, empty values and ; { } are left out with a reason", () => {
  const { tokens, removed } = checkTokens({ canvas: "#000", "--Ink": "#fff", "--a": "", "--b": "red; } body { display: none", "--c": "{x}" });
  eq(tokens, {});
  eq(removed.map((r) => r.what), ["canvas", "--Ink", "--a", "--b", "--c"]);
});
test("tokens: an outside url() becomes none; a data: image stays", () => {
  const { tokens, removed } = checkTokens({ "--image-x": "url(https://evil.example/t.png)", "--image-y": 'url("data:image/png;base64,iVBORw0KGgo=")' });
  eq(tokens["--image-x"], "none");
  ok(tokens["--image-y"].startsWith('url("data:image/png'), "data: image kept");
  eq(removed, [{ what: "--image-x", why: "outside links" }]);
});
test("tokens: ; { } only inside quotes; an open quote or a line break is refused", () => {
  const { tokens, removed } = checkTokens({ "--a": "'Iowan Old Style', serif", "--b": '"a;b{c}"', "--c": '"open', "--d": "1px\n2px", "--e": "\"x\" ; color: red", "--f": "red\\" });
  eq(Object.keys(tokens), ["--a", "--b"]);
  eq(removed.map((r) => r.what), ["--c", "--d", "--e", "--f"]);
});
test("tokens: an escaped url() is caught too", () => {
  eq(checkTokens({ "--x": "u\\72l(https://evil.example/a)" }).tokens["--x"], "none");
});
test("tokens: no more than 300", () => {
  const many = Object.fromEntries(Array.from({ length: 310 }, (_, i) => [`--t-${i}`, "1px"]));
  const { tokens, removed } = checkTokens(many);
  eq(Object.keys(tokens).length, 300);
  eq(removed.length, 10);
});
test("look: an unknown base theme falls back to graphite, with a note", () => {
  const { look, notes } = checkLook({ base: "neon" });
  eq(look.base, "graphite");
  ok(notes.some((n) => n.includes("neon")), "note about the base");
});
test("look: CSS goes through the safety check, and what it removed is noted", () => {
  const { look, notes } = checkLook({ css: "@import url(https://evil.example/a.css);\nbody { background: url(https://evil.example/b.png); }" });
  ok(!look.css.includes("evil.example"), look.css);
  ok(notes.some((n) => n.includes("@import")) && notes.some((n) => n.includes("outside links")), notes.join(" | "));
});
test("look: CSS over 100 KB is refused", () => {
  let threw = null;
  try {
    checkLook({ css: "a{}".repeat(40_000) });
  } catch (error) {
    threw = error;
  }
  ok(threw instanceof LookError, "a LookError");
});
test("look: images need a slot name, an image type, a sha-256 and a size within the limit", () => {
  const { look, notes } = checkLook({
    images: {
      background: image(HASH_A),
      "Bad Name": image(HASH_A),
      script: { hash: HASH_A, type: "text/html", size: 10 },
      nohash: { type: "image/png", size: 10 },
      huge: { hash: HASH_B, type: "image/png", size: 5_000_000 },
    },
  });
  eq(Object.keys(look.images), ["background"]);
  eq(notes.length, 4);
});
test("look: at most 12 images", () => {
  const images = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`img-${i}`, image(HASH_A)]));
  eq(Object.keys(checkLook({ images }).look.images).length, 12);
});

// ---------- an AI's change ----------

const start = { name: "Mine", base: "paper", tokens: { "--canvas": "#fff", "--ink-1": "#111" }, css: "a { color: red; }", images: { background: image(HASH_A) } };

test("patch: tokens merge, and null removes one", () => {
  const { look } = patchLook(start, { tokens: { "--well": "#eee", "--ink-1": null } });
  eq(look.tokens, { "--canvas": "#fff", "--well": "#eee" });
  eq(look.css, start.css);
  eq(look.base, "paper");
});
test("patch: a meaning color mixes its tint and edge, unless they're given", () => {
  const { look } = patchLook(start, { tokens: { "--m-right": "#3366ff" } });
  ok(look.tokens["--m-right-bg"] === "color-mix(in srgb, #3366ff 14%, transparent)", look.tokens["--m-right-bg"]);
  ok(look.tokens["--m-right-edge"]?.includes("42%"), "edge mixed");
  const given = patchLook(start, { tokens: { "--m-wrong": "#ff8800", "--m-wrong-bg": "transparent" } }).look;
  eq(given.tokens["--m-wrong-bg"], "transparent");
  ok(given.tokens["--m-wrong-edge"]?.includes("#ff8800"), "edge still mixed");
});
test("patch: removing a meaning color removes its tint and edge too", () => {
  const withRight = patchLook(start, { tokens: { "--m-right": "#3366ff" } }).look;
  const { look } = patchLook(withRight, { tokens: { "--m-right": null } });
  ok(!Object.keys(look.tokens).some((n) => n.startsWith("--m-right")), JSON.stringify(look.tokens));
});
test("patch: replaceTokens replaces them all", () => {
  eq(patchLook(start, { tokens: { "--well": "#eee" }, replaceTokens: true }).look.tokens, { "--well": "#eee" });
});
test("patch: reset clears tokens, CSS and images but keeps the base theme and name", () => {
  const { look } = patchLook(start, { reset: true });
  eq(look, { theme: null, name: "Mine", base: "paper", tokens: {}, css: "", images: {} });
  eq(patchLook(start, { reset: true, base: "sepia" }).look.base, "sepia");
});
test("patch: css replaces the CSS, and goes through the safety check", () => {
  const { look, notes } = patchLook(start, { css: "b { color: blue } i { background: url(http://x.example/a) }" });
  ok(look.css.startsWith("b { color: blue }") && !look.css.includes("x.example"), look.css);
  ok(notes.some((n) => n.includes("outside links")), "noted");
});
test("patch: removeImages empties slots, and says when there was nothing to remove", () => {
  const { look, notes } = patchLook(start, { removeImages: ["background", "mark"] });
  eq(look.images, {});
  eq(notes, ['No image called "mark" to remove']);
});
test("patch: setImages puts stored images into slots", () => {
  eq(Object.keys(patchLook(start, { setImages: { mark: image(HASH_B) } }).look.images), ["background", "mark"]);
});
test("patch: a bad token in a patch is left out, the rest applies", () => {
  const { look, notes } = patchLook(start, { tokens: { "--well": "#eee", "--bad": "x;y" } });
  eq(look.tokens["--well"], "#eee");
  ok(!("--bad" in look.tokens) && notes.some((n) => n.includes("--bad")), "bad token noted");
});

// ---------- two devices ----------

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
test("merge: different tokens changed on each side are both kept", () => {
  const local = { ...start, tokens: { ...start.tokens, "--well": "#eee" } };
  const server = { ...start, tokens: { ...start.tokens, "--chrome": "#ddd" } };
  eq(sorted(mergeLooks(start, local, server).tokens), sorted({ "--canvas": "#fff", "--ink-1": "#111", "--well": "#eee", "--chrome": "#ddd" }));
});
test("merge: the same token changed on both sides: local wins", () => {
  const local = { ...start, tokens: { ...start.tokens, "--canvas": "#000" } };
  const server = { ...start, tokens: { ...start.tokens, "--canvas": "#333" } };
  eq(mergeLooks(start, local, server).tokens["--canvas"], "#000");
});
test("merge: a token removed locally stays removed; the server's CSS change survives an untouched local CSS", () => {
  const local = { ...start, tokens: { "--canvas": "#fff" } };
  const server = { ...start, css: "a { color: green; }" };
  const merged = mergeLooks(start, local, server);
  eq(merged.tokens, { "--canvas": "#fff" });
  eq(merged.css, "a { color: green; }");
});
test("merge: images merge slot by slot", () => {
  const local = { ...start, images: {} };
  const server = { ...start, images: { background: image(HASH_A), mark: image(HASH_B) } };
  eq(Object.keys(mergeLooks(start, local, server).images), ["mark"]);
});
test("merge: from nothing, local changes go on top of the server's look", () => {
  const merged = mergeLooks(emptyLook(), { ...emptyLook(), tokens: { "--well": "#eee" } }, start);
  eq(merged.tokens, { "--canvas": "#fff", "--ink-1": "#111", "--well": "#eee" });
  eq(merged.base, "paper");
});

// ---------- sections ----------

test("sections: every section has a built-in background slot, and a session falls back to Study", () => {
  eq(Object.keys(SECTIONS), ["today", "study", "read", "know", "explore", "settings", "session"]);
  for (const id of Object.keys(SECTIONS)) ok(`background-${id}` in IMAGE_SLOTS, `background-${id} is a built-in slot`);
  eq(SECTION_FALLBACK, { session: "study" });
});
test("sections: slot names can't be a background setting's token name", () => {
  for (const name of BACKGROUND_SETTINGS) {
    ok(!SLOT_NAME.test(`background-${name}`), `background-${name} refused`);
    ok(!SLOT_NAME.test(`background-read-${name}`), `background-read-${name} refused`);
  }
  for (const name of ["background", "background-read", "background-session", "mark", "paper", "read-size", "backgrounds-size-x"]) ok(SLOT_NAME.test(name), `${name} allowed`);
  eq(checkLook({ images: { "background-read-dim": image(HASH_A) } }).look.images, {}, "a look can't hold one");
});
test("sections: a look keeps section images and their settings, and patches them like any other", () => {
  const withSections = patchLook(emptyLook(), {
    setImages: { "background-read": image(HASH_A, "ship.svg"), "background-session": image(HASH_B, "quiet.svg") },
    tokens: { "--image-background-read-size": "160px", "--image-background-read-repeat": "repeat", "--image-background-session-dim": "90%" },
  });
  eq(Object.keys(withSections.look.images), ["background-read", "background-session"]);
  eq(withSections.notes, []);
  const removed = patchLook(withSections.look, { removeImages: ["background-read"], tokens: { "--image-background-read-size": null, "--image-background-read-repeat": null } }).look;
  eq(Object.keys(removed.images), ["background-session"]);
  eq(removed.tokens, { "--image-background-session-dim": "90%" });
});
test("sections: two devices adding different sections' backgrounds both keep theirs", () => {
  const server = { ...emptyLook(), images: { "background-today": image(HASH_A) } };
  const local = { ...emptyLook(), images: { "background-know": image(HASH_B) } };
  eq(Object.keys(mergeLooks(emptyLook(), local, server).images).sort(), ["background-know", "background-today"]);
});

// ---------- comparing ----------

test("canonical: token and image order don't matter; image names don't either", () => {
  const a = { ...start, tokens: { "--ink-1": "#111", "--canvas": "#fff" } };
  const b = { ...start, images: { background: image(HASH_A, "other name.png") } };
  ok(sameLook(start, a), "token order");
  ok(sameLook(start, b), "image name");
  ok(!sameLook(start, { ...start, css: "" }), "different CSS");
  eq(canonicalLook(emptyLook()), canonicalLook({}));
});
test("describe: says what a look changes", () => {
  eq(describeLook(emptyLook()), "The theme as it comes");
  const withRight = patchLook(start, { tokens: { "--m-right": "#3366ff" } }).look;
  ok(describeLook(withRight).startsWith("3 tokens"), describeLook(withRight));
  ok(describeLook(start).includes("background"), describeLook(start));
});


// ---------- saved themes ----------

const THEME = "k3v9x2m7q1w8e5r4";
test("themes: a look keeps a well-formed theme id and drops anything else", () => {
  eq(checkLook({ ...start, theme: THEME }).look.theme, THEME);
  for (const bad of ["Short1", "has space here", "UPPERCASE12345", "a".repeat(33), 12345678, null, undefined]) eq(checkLook({ ...start, theme: bad }).look.theme, null, String(bad));
  eq(emptyLook().theme, null, "a built-in theme as it comes");
});
test("themes: new ids are well formed and different", () => {
  const ids = new Set(Array.from({ length: 200 }, () => newThemeId()));
  eq(ids.size, 200, "200 different ids");
  for (const id of ids) ok(THEME_ID.test(id), id);
});
test("themes: what counts as a change (a name alone doesn't)", () => {
  ok(!hasChanges(emptyLook()), "empty");
  ok(!hasChanges({ ...emptyLook(), name: "Named", base: "paper" }), "a name and a base");
  ok(hasChanges({ ...emptyLook(), tokens: { "--canvas": "#000" } }), "a token");
  ok(hasChanges({ ...emptyLook(), css: "a{}" }), "CSS");
  ok(hasChanges({ ...emptyLook(), images: { mark: image(HASH_A) } }), "an image");
});
test("themes: a theme's content is the look without which theme it is", () => {
  const content = themeContent({ ...start, theme: THEME });
  ok(!("theme" in content), "no theme field");
  eq(Object.keys(content).sort(), ["base", "css", "images", "name", "tokens"]);
});
test("themes: an AI's change keeps the theme; starting over keeps its name and theme too", () => {
  const look = { ...start, theme: THEME, name: "Delft" };
  eq(patchLook(look, { tokens: { "--canvas": "#000" } }).look.theme, THEME);
  const reset = patchLook(look, { reset: true }).look;
  eq([reset.theme, reset.name, Object.keys(reset.tokens).length, reset.css], [THEME, "Delft", 0, ""]);
});
test("themes: a merge keeps the server's theme", () => {
  const base = { ...start, theme: THEME };
  const local = { ...base, css: "x{}" };
  eq(mergeLooks(base, local, { ...base, tokens: { "--ink-1": "#222" } }).theme, THEME);
});
test("themes: sameLook tells two themes apart; sameContent doesn't", () => {
  const a = { ...start, theme: THEME };
  const b = { ...start, theme: "zzzzzzzzzzzzzzzz" };
  ok(!sameLook(a, b), "different themes");
  ok(sameContent(a, b), "same content");
  ok(sameContent(a, { ...start, theme: null }), "a theme and the same look with none");
});
test("themes: names stay unique among yours, case aside", () => {
  eq(uniqueName("Delft", []), "Delft");
  eq(uniqueName("Delft", ["delft"]), "Delft 2");
  eq(uniqueName("Delft", ["Delft", "Delft 2"]), "Delft 3");
  eq(uniqueName("  ", []), "My theme");
  eq(editedName("graphite", []), "Graphite, edited");
  eq(editedName("auto", ["Match device, edited"]), "Match device, edited 2");
  eq(copyName("Delft", ["Delft copy"]), "Delft copy 2");
  ok(uniqueName("x".repeat(200), []).length <= 80, "within the name limit");
});
test("themes: the base list is the built-in themes, then the ready-made ones (lx/theme-presets.js), each a look may start from", () => {
  eq(BASE_THEMES.slice(0, BUILT_IN_THEMES.length), BUILT_IN_THEMES.map((t) => t.id));
  eq(BASE_THEMES.slice(BUILT_IN_THEMES.length), READY_IDS);
  eq(builtInName("contrast"), "High contrast");
  eq(builtInName("night-forest"), "Night forest");
  eq(checkLook({ base: "ocean", tokens: {} }).look.base, "ocean");
  eq(checkLook({ base: "no-such-theme", tokens: {} }).look.base, "graphite");
});

test("any field of a look or a change, set to an object whose toString is null, is left out or refused, never thrown on", () => {
  const trap = JSON.parse('{"toString": null}');
  const paths = (value, at = []) => [at, ...(value && typeof value === "object" ? Object.keys(value).flatMap((key) => paths(value[key], [...at, key])) : [])];
  const planted = (value, path) => {
    if (!path.length) return trap;
    const copy = structuredClone(value);
    let node = copy;
    for (const key of path.slice(0, -1)) node = node[key];
    node[path.at(-1)] = trap;
    return copy;
  };
  const hash = "a".repeat(64);
  const look = { theme: "abcdefgh12", name: "Warm", base: "paper", tokens: { "--accent": "#c05", "--m-right": "#2a6" }, css: '[data-part="card"] { border-radius: 12px; }', images: { background: { hash, type: "image/png", size: 1234, name: "bg.png" } } };
  const patch = { reset: false, base: "sepia", name: "Warmer", tokens: { "--accent": "#d16", "--m-wrong": "#c33", "--old": null }, replaceTokens: false, css: "body { letter-spacing: 0.01em; }", removeImages: ["background"], setImages: { mark: { hash, type: "image/svg+xml", size: 900, name: "mark.svg" } } };
  const cases = [
    ["checkLook", (v) => checkLook(v), look],
    ["patchLook", (v) => patchLook(look, v), patch],
    ["patchLook's current", (v) => patchLook(v, patch), look],
    ["checkTokens", (v) => checkTokens(v), look.tokens],
    ["mergeLooks", (v) => mergeLooks(look, v, look), look],
    ["sameLook / describeLook", (v) => (sameLook(v, look), describeLook(checkLook(v).look)), look],
    // A name comes from a request; the names taken are the account's own themes, never a request's.
    ["names", (v) => (uniqueName(v, ["Warm", "Warm copy"]), copyName(v, ["Warm", "Warm copy"])), "Warm"],
  ];
  const thrown = [];
  for (const [name, fn, valid] of cases) {
    fn(structuredClone(valid));
    for (const path of paths(valid)) {
      try {
        fn(planted(valid, path));
      } catch (error) {
        if (!(error instanceof LookError)) thrown.push(`${name} at ${path.join(".") || "(itself)"}: ${error.message}`);
      }
    }
  }
  if (thrown.length) throw new Error(`${thrown.length} threw: ${thrown.slice(0, 6).join(" · ")}`);
});

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${passed}/${passed + failures.length} look-rule tests passed`);
process.exit(failures.length ? 1 : 0);

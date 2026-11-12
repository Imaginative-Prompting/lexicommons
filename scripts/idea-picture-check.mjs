// An idea's picture (study/concept-picture.js rulePicture: a sentence with the idea's shape drawn over it) comes out the same whenever it
// reaches the page. Knowledge builds its idea cards a few at a time before they're on the page; a picture was fitted and drawn only if it
// was on the page by the frame after it was built, so the same card came out at one size or another, with its shape or without, by timing
// (11 Nov 2026: the tab's cards a step apart between two runs of the same files). Here each picture is built in place, then built off the
// page and put on it 1, 3 and 30 frames later, in the same spot: its sentence's size, its box, its lines and every stroke and label of its
// shape must be the same, on a phone and on a computer, as a card on Knowledge's tab and on an idea's sheet. First a control: one put on the
// page and read before any frame has passed isn't fitted or drawn yet, and must be told apart, so this can fail.
//
//   node scripts/idea-picture-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]
//
// --from <copy> serves another copy's /js and /css (the app from before 11 Nov 2026 fails it: a late picture has no size of its own and no
// shape). On the design page, which needs no account. Through gpu.py's parallel lane. Exit 0 = pass.
import { chromium } from "./quiet-browser.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const FROM = argv.includes("--from") ? resolve(argv[argv.indexOf("--from") + 1]) : null;
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/idea-picture-check.mjs http://localhost:<port> <outDir> [--from <copy dir>]   (LOCAL only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
let failed = 0;
const say = (ok, what, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

// Sentences with each kind of shape (an arc to an ending, a box, labels over particles), short and long, so the fit lands on more than one
// size and one wraps: the marks as a pack gives them (item.shapes).
const CASES = [
  { name: "an arc to an ending, short", lang: "es", words: ["Yo", "hablo", "español."], lemmas: ["yo", "hablar", "español"], shapes: [{ shape: "lit", words: [1] }, { shape: "affix", word: 1, chars: [[4, 5]] }, { shape: "link", from: 0, to: 1, toChars: [4, 5], note: "The -o is for yo: hablo, I speak." }] },
  { name: "a box, medium", lang: "es", words: ["La", "casa", "de", "mi", "hermana", "es", "grande."], shapes: [{ shape: "lit", words: [0] }, { shape: "box", from: 0, to: 1, note: "Casa takes la: la casa, the house." }] },
  { name: "an arc, a line longer", lang: "es", words: ["Ellos", "comieron", "pan", "con", "queso", "ayer."], lemmas: ["ellos", "comer", "pan", "con", "queso", "ayer"], shapes: [{ shape: "lit", words: [1] }, { shape: "affix", word: 1, chars: [[3, 8]] }, { shape: "link", from: 0, to: 1, toChars: [3, 8] }] },
  { name: "an arc and a box, wrapping", lang: "es", words: ["Ellos", "comieron", "pan", "en", "la", "casa", "grande", "de", "mi", "hermana", "ayer", "por", "la", "tarde."], shapes: [{ shape: "lit", words: [1] }, { shape: "affix", word: 1, chars: [[3, 8]] }, { shape: "link", from: 0, to: 1, toChars: [3, 8] }, { shape: "box", from: 4, to: 5 }] },
  { name: "labels, no spaces", lang: "ja", separator: "", words: ["猫", "が", "魚", "を", "食べた。"], lemmas: ["猫", null, "魚", null, "食べる"], shapes: [{ shape: "lit", words: [1, 3] }, { shape: "tag", word: 1, text: "subject" }, { shape: "tag", word: 3, text: "object" }, { shape: "affix", word: 4, chars: [[2, 3]] }] },
];
const LATE = [1, 3, 30]; // frames a picture waits off the page before it's put on it

// In the page: every case in both places, built in place and late, each read once it has settled.
const RUN = async ({ cases, late }) => {
  const { rulePicture } = await import("/js/study/concept-picture.js");
  await document.fonts.ready;
  const frames = (n) =>
    new Promise((done) => {
      const step = () => (n-- > 0 ? requestAnimationFrame(step) : done());
      step();
    });
  const settle = async () => {
    await frames(8);
    await document.fonts.ready;
    await frames(4);
  };
  const host = document.createElement("div");
  host.id = "idea-picture-check";
  host.style.position = "absolute";
  host.style.left = "16px";
  host.style.top = "16px";
  host.style.width = `${Math.min(innerWidth - 32, 688)}px`;
  host.style.zIndex = "2147483000";
  host.style.background = "var(--canvas)";
  document.body.append(host);
  // Where a picture goes: a card as Knowledge's tab builds one (know/cards-more.js), or an idea's sheet.
  const PLACES = {
    card: (figure) => {
      const card = document.createElement("button");
      card.type = "button";
      card.setAttribute("data-part", "idea-card");
      const picture = document.createElement("span");
      picture.className = "lx-idea-picture";
      picture.append(figure);
      card.append(picture);
      return card;
    },
    sheet: (figure) => {
      const sheet = document.createElement("div");
      sheet.setAttribute("data-part", "concept-sheet");
      sheet.className = "lx-stack";
      sheet.append(figure);
      return sheet;
    },
  };
  const round = (n) => Math.round(n * 10) / 10;
  const read = (figure) => {
    const line = figure.querySelector(".lx-rule-line");
    const svg = figure.querySelector(".lx-rule-shape");
    const box = figure.getBoundingClientRect();
    const tops = new Set([...figure.querySelectorAll(".lx-rule-line .lx-rule-word")].map((word) => Math.round(word.getBoundingClientRect().top)));
    return {
      scale: line.style.getPropertyValue("--rule-scale"),
      font: getComputedStyle(line).fontSize,
      box: [round(box.width), round(box.height)],
      lines: tops.size,
      marks: svg.querySelectorAll("path, text").length,
      shape: svg.outerHTML,
    };
  };
  const make = ({ name, ...one }) => rulePicture(one).node;
  const out = [];
  for (const [place, wrap] of Object.entries(PLACES)) {
    for (const one of cases) {
      // In place: on the page in the task that built it.
      const here = make(one);
      host.replaceChildren(wrap(here));
      await settle();
      const inPlace = read(here);
      host.replaceChildren();
      await frames(3);
      // The control: put on the page late and read at once, before a frame.
      const cold = make(one);
      await frames(3);
      host.replaceChildren(wrap(cold));
      const unsettled = read(cold);
      host.replaceChildren();
      await frames(3);
      const lates = [];
      for (const wait of late) {
        const figure = make(one);
        await frames(wait);
        host.replaceChildren(wrap(figure));
        await settle();
        lates.push({ wait, ...read(figure) });
        if (wait === late.at(-1)) globalThis.__ideaPictureLast = `${place}: ${one.name}`;
        host.replaceChildren();
        await frames(3);
      }
      out.push({ place, name: one.name, inPlace, unsettled, lates });
    }
  }
  // One left on the page for the picture this check keeps: the last case, late.
  const shown = make(cases.at(-1));
  await frames(late.at(-1));
  host.replaceChildren(PLACES.card(shown));
  await settle();
  return out;
};

const same = (a, b) => a.scale === b.scale && a.font === b.font && a.box[0] === b.box[0] && a.box[1] === b.box[1] && a.lines === b.lines && a.shape === b.shape;
const differs = (a, b) =>
  [a.scale !== b.scale && `size ${b.scale || "none of its own"} (${b.font}), not ${a.scale} (${a.font})`, (a.box[0] !== b.box[0] || a.box[1] !== b.box[1]) && `box ${b.box.join(" × ")}, not ${a.box.join(" × ")}`, a.lines !== b.lines && `${b.lines} lines, not ${a.lines}`, a.shape !== b.shape && `${b.marks} strokes and labels${b.marks === a.marks ? " drawn elsewhere" : `, not ${a.marks}`}`]
    .filter(Boolean)
    .join("; ");

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const browser = await chromium.launch({ headless: true });
const report = {};
for (const [name, viewport, touch] of [["phone", { width: 390, height: 844 }, true], ["computer", { width: 1280, height: 800 }, false]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, serviceWorkers: "block", colorScheme: "dark" });
  if (FROM) {
    await context.route(/\/(js|css)\/[^?]+/, (route) => {
      const file = join(FROM, "public", new URL(route.request().url()).pathname);
      return existsSync(file) ? route.fulfill({ status: 200, contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) }) : route.continue();
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(`${BASE}/design/`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(RUN, { cases: CASES, late: LATE });
  await page.screenshot({ path: join(OUT, `${name}-late.png`) });
  report[name] = rows;

  // The pictures built in place are fitted and drawn (or there's nothing to compare), and the fit landed on more than one size.
  const undrawn = rows.filter((row) => !row.inPlace.scale || !row.inPlace.marks).map((row) => `${row.place}: ${row.name}`);
  const sizes = [...new Set(rows.map((row) => row.inPlace.scale))];
  say(rows.length === 2 * CASES.length && !undrawn.length, `${name}: built in place, every picture is fitted and has its shape`, undrawn.length ? `not ${undrawn.join(", ")}` : `${rows.length} pictures, sizes ${sizes.join(", ")}, ${rows.filter((row) => row.inPlace.lines > 1).length} on more than one line`);
  say(sizes.length > 1, `${name}: the fit landed on more than one size`, sizes.join(", "));
  // The control: read before a frame has passed, a late picture is told apart.
  const blind = rows.filter((row) => same(row.inPlace, row.unsettled)).map((row) => `${row.place}: ${row.name}`);
  say(!blind.length, `${name}: the control: a picture read before any frame isn't fitted or drawn, and is told apart`, blind.length ? `not told apart: ${blind.join(", ")}` : `all ${rows.length}`);
  // The rule.
  const apart = rows.flatMap((row) => row.lates.filter((late) => !same(row.inPlace, late)).map((late) => `${row.place}, ${row.name}, ${late.wait} frame${late.wait === 1 ? "" : "s"} late: ${differs(row.inPlace, late)}`));
  say(!apart.length, `${name}: put on the page ${LATE.join(", ")} frames after it's built, a picture is the one built in place: its size, box, lines and shape`, apart.length ? `${apart.length} of ${rows.length * LATE.length} differ: ${apart.slice(0, 4).join(" | ")}` : `${rows.length * LATE.length} late pictures`);
  say(errors.length === 0, `${name}: no page error`, errors.slice(0, 2).join(" | "));
  await context.close();
}
writeFileSync(join(OUT, "idea-picture-check.json"), JSON.stringify(report, null, 1));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);

// A rule's picture: one sentence, the words the rule is about lit, and the rule's shape drawn on them (docs/design-bible.md, A rule's
// picture). It draws marks (study/concept-shape.js, pure and tested): an item's own (item.shapes, any language), or, without them, the ones
// Dutch's notes give. A bracket under a frame, carried across lines; the parts of a clause numbered; an arc for a link; an affix's letters
// colored where they are in the word; a box around words that go together; a small label over a word. Measured from where the words
// actually sit, so it draws the same in any script and either direction. With nothing to draw, it's the sentence with its words lit.
// Drawn once as the sheet opens, quietly, through motion.js (a press finishes it; none with animations off); the drawing takes no presses.
// Its words are shown as a sentence's are everywhere: each with its reading while it's new (Russian's stress mark on the word, kana over
// kanji), hidden once the word is Strong and brought back by a tap (lx/ui.js showReading).
import { el, showReading } from "../lx/ui.js";
import { readingKind, rubyOf, rubyText, vowelled } from "../lang/readings.js";
import * as motion from "../lx/motion.js";
import { formatNumber, t } from "../lx/i18n.js";
import { layoutOf, literalChunks, marksOf, saidOfMarks, split } from "./concept-shape.js";

const SVG = "http://www.w3.org/2000/svg";
const svgEl = (name, attrs = {}) => {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, String(value));
  return node;
};
const bare = (text) => String(text ?? "").toLocaleLowerCase().replace(/[.,!?;:’'“”"()¿¡]/g, "");

// The lines under the picture (concept-shape.js names them), each one message with the sentence's words as its named parts.
const SAY = {
  ending: (parts) => t("study.picture.ending", parts),
  endingFor: (parts) => t("study.picture.endingFor", parts),
  goesWith: (parts) => t("study.picture.goesWith", parts),
  closes: (parts) => t("study.picture.closes", parts),
  closesEach: (parts) => t("study.picture.closesEach", parts),
  placeRole: (parts) => t("study.picture.placeRole", parts),
  place: (parts) => t("study.picture.place", parts),
};

// An affix's letters are colored where they are in the word through the CSS Highlight API, on a range of the word's own text: the word
// is never split into pieces, so letters that join (Arabic) keep joining. Every picture's ranges share one highlight. Where a browser
// hasn't the API, the letters get an underline drawn from the range's rects instead.
const AFFIX = "lx-rule-affix";
const highlighting = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
const affixRanges = new Set();
const paintAffixes = () => {
  if (highlighting) affixRanges.size ? CSS.highlights.set(AFFIX, new Highlight(...affixRanges)) : CSS.highlights.delete(AFFIX);
};

// A word as a sentence's words are shown (lx/ui.js wordNodes): with its reading ({ reading, hidden }) while it's new: marks on the word
// itself in a language that writes them so (vowels: Russian's stress, Arabic's vowels), else over it (ruby: kana); hidden at Strong.
const wordBody = (text, reading, lang) => {
  if (!reading?.reading) return [text];
  const state = reading.hidden ? "hidden" : undefined;
  if (readingKind(lang) === "vowels") return [el("span", { part: "reading", variant: "vowels", state }, vowelled(lang, text, reading.reading)), el("span", { class: "lx-bare" }, text)];
  return rubyOf(lang, text, reading.reading).map(([piece, said]) => (said ? el("ruby", {}, piece, el("rt", { part: "reading", state }, rubyText(said))) : piece));
};
// Where each letter of a word is in its marked form: the same letters with marks added (Russian's stress, a vowel's marks), a letter maybe
// written with its mark as one (ā for a). [index in marked, …, marked's length], or null when the two aren't the same word.
const alignMarks = (word, marked) => {
  const at = [];
  let m = 0;
  for (let w = 0; w < word.length; w++) {
    const letter = word[w];
    while (m < marked.length && marked[m] !== letter && marked[m].normalize("NFD")[0] !== letter && /\p{M}/u.test(marked[m])) m++;
    if (m >= marked.length || (marked[m] !== letter && marked[m].normalize("NFD")[0] !== letter)) return null;
    at.push(m++);
  }
  return [...at, marked.length];
};
// A range over text nodes in order, by character: from start to end of their letters together.
const rangeOver = (nodes, start, end) => {
  if (end <= start) return null;
  const range = document.createRange();
  let seen = 0;
  let begun = false;
  for (const node of nodes) {
    const length = node.data.length;
    if (!begun && start < seen + length) {
      range.setStart(node, start - seen);
      begun = true;
    }
    if (begun && end <= seen + length) {
      range.setEnd(node, end - seen);
      return range;
    }
    seen += length;
  }
  return null;
};
// A word's own letters, as a range: from character start to end ([start, end) in the word as written; its punctuation is outside the span),
// over what's shown: its marked form while that shows, its text otherwise; a ruby's reading isn't among its letters.
const wordRange = (span, [start, end]) => {
  const marked = span.querySelector('[data-part="reading"][data-variant="vowels"]');
  const bareText = span.querySelector(".lx-bare")?.firstChild;
  if (marked) {
    const text = marked.firstChild;
    if (marked.getAttribute("data-state") === "hidden" || !text) return bareText ? rangeOver([bareText], Math.max(0, start), Math.min(end, bareText.data.length)) : null;
    const at = bareText && alignMarks(bareText.data, text.data);
    if (!at) return null;
    const word = bareText.data.length;
    return rangeOver([text], at[Math.max(0, Math.min(start, word))], at[Math.max(0, Math.min(end, word))]);
  }
  const nodes = [];
  const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!node.parentElement.closest("rt")) nodes.push(node);
  const length = nodes.reduce((sum, node) => sum + node.data.length, 0);
  return rangeOver(nodes, Math.max(0, Math.min(start, length)), Math.max(0, Math.min(end, length)));
};

/**
 * The picture. kind: the concept's picture (frame, place, order, ending, agreement, article) or nothing, for Dutch's notes; shapes: the
 * item's own marks for this concept, which win when there are any; words: the sentence's words as written (else text split on spaces);
 * separator, dir: how the language joins its words and which way it runs; marks: the words the rule is about; roles, lemmas: what each
 * word is doing and its dictionary form, when known; readings: each word's { reading, hidden } (or null), as the sentence's words have
 * them; means, literal: what it means, and word for word in its own order. Returns
 * { node, play }: play(after) draws it in, once.
 */
export function rulePicture({ kind, shapes, words: given, readings = [], text, separator = " ", dir = "ltr", marks = [], roles = [], lemmas = [], lang, means, literal }) {
  const words = Array.isArray(given) && given.length ? given.map(String) : String(text ?? "").split(" ");
  const own = Array.isArray(shapes) && shapes.length;
  const picture = own ? { marks: shapes, said: saidOfMarks(shapes, words, lemmas) } : marksOf({ kind, words, marks, roles, lemmas });
  const shape = layoutOf(picture.marks);
  const affixed = (at) => shape.affixes.has(at);

  // Each word as written: its letters in a span (one text node, so a range can color an affix), its punctuation after it.
  const spans = words.map((word, at) =>
    el(
      "span",
      {
        class: "lx-rule-word",
        "data-lit": shape.lit.has(at) ? "" : undefined,
        "data-piece": shape.pieces.has(at) ? "" : undefined,
        "data-affixed": affixed(at) ? "" : undefined,
        onclick: readings[at]?.reading ? (event) => showReading(event.currentTarget) : undefined,
      },
      ...wordBody(split(word)[0], readings[at], lang),
    ),
  );
  // Words drawn together (a box, an arc between neighbors) never break across lines, a box or an arc can't span two: each run sits in
  // one unbreakable group, with room outside it for the box.
  const runs = shape.together.filter(([a, b]) => b > a);
  const runAt = (i) => runs.find(([a, b]) => a <= i && i <= b);
  const parts = [];
  for (let i = 0; i < words.length; i++) {
    const run = runAt(i);
    const piece = (j) => [j > i ? separator : null, spans[j], split(words[j])[1] || null].filter((part) => part != null && part !== "");
    if (run && run[0] === i) {
      const inside = [];
      for (let j = i; j <= run[1]; j++) inside.push(...piece(j));
      if (i > 0 && separator) parts.push(separator);
      parts.push(el("span", { class: "lx-rule-run", "data-boxed": shape.boxes.some(([a, b]) => a === run[0] && b === run[1]) ? "" : undefined }, ...inside));
      i = run[1];
      continue;
    }
    if (i > 0 && separator) parts.push(separator);
    parts.push(spans[i], ...(split(words[i])[1] ? [split(words[i])[1]] : []));
  }
  const line = el("p", { class: "lx-rule-line", lang, dir }, ...parts);
  const svg = svgEl("svg", { class: "lx-rule-shape", "aria-hidden": "true" });

  // What it says, in words, under the sentence: the language's words in its face, names set strong. An item's own notes as written.
  const strong = (value) => el("strong", { lang, dir: "auto" }, value);
  // A word in a line with its changed letters colored the same way, never split (WebKit stops joining Arabic letters across spans). Without
  // the Highlight API it's shown whole.
  const lineRanges = [];
  const wordWith = ({ text: w, spans: marked }) => {
    const node = el("span", { lang, dir: "auto" }, w);
    for (const span of marked) {
      const range = wordRange(node, span);
      if (range) lineRanges.push(range);
    }
    return node;
  };
  const say = (one) => {
    if (one.note) return el("span", {}, one.note);
    const values = {};
    for (const [key, value] of Object.entries(one.parts)) values[key] = key === "role" || key === "place" ? value : typeof value === "object" ? wordWith(value) : strong(value);
    return SAY[one.line] ? el("span", {}, SAY[one.line](values)) : null;
  };
  const said = picture.said.map(say).filter(Boolean);

  // Word for word in its own order, lit as the sentence is, when it lines up one for one and says something the meaning doesn't.
  const chunks = literalChunks(literal);
  const literalText = chunks.join(" ").replace(/\s+/g, " ").trim();
  const literalLine =
    chunks.length === words.length && literalText && bare(literalText) !== bare(means)
      ? el("p", { class: "lx-rule-literal" }, ...chunks.flatMap((chunk, at) => (chunk ? [el("span", { class: "lx-rule-word", "data-lit": shape.lit.has(at) || shape.pieces.has(at) ? "" : undefined }, chunk), " "] : [])))
      : null;
  const figure = el(
    "figure",
    {
      class: "lx-rule",
      "data-under": shape.frames.length || shape.places ? "" : undefined,
      "data-boxes": shape.boxes.length ? "" : undefined,
      "data-tags": shape.tags.length ? "" : undefined,
    },
    el("div", { class: "lx-rule-stage" }, line, svg),
    means ? el("p", { class: "lx-rule-means" }, means) : null,
    literalLine,
    said.length ? el("figcaption", { class: "lx-rule-said" }, ...said) : null,
  );

  // The affixes' ranges, colored as long as the picture is on the page.
  const ranges = [...shape.affixes].flatMap(([at, chars]) => chars.map((span) => wordRange(spans[at], span)).filter(Boolean));
  const keep = () => {
    for (const range of [...ranges, ...lineRanges]) affixRanges.add(range);
    paintAffixes();
  };
  const drop = () => {
    for (const range of [...ranges, ...lineRanges]) affixRanges.delete(range);
    paintAffixes();
  };

  // The shape, measured from the words where they've laid out.
  const rtl = dir === "rtl";
  let drawn = [];
  let labels = [];
  let drawIn = () => {};
  const draw = () => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    svg.replaceChildren();
    drawn = [];
    labels = [];
    const rect = (r) => ({ left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top, mid: (r.left + r.right) / 2 - box.left });
    const at = (i) => rect(spans[i].getBoundingClientRect());
    // A word's characters, where they sit (the first line they're on).
    const charsAt = (i, chars) => {
      const range = chars && wordRange(spans[i], chars);
      const r = range?.getClientRects()[0];
      return r ? { ...at(i), ...rect(r) } : at(i);
    };
    const path = (d, cls) => {
      const p = svgEl("path", { d, class: cls, fill: "none" });
      svg.append(p);
      drawn.push(p);
      return p;
    };
    const label = (x, y, value, lit, cls) => {
      const node = svgEl("text", { x, y, "text-anchor": "middle", class: cls, "data-lit": lit ? "" : undefined });
      node.textContent = value;
      svg.append(node);
      labels.push(node);
    };

    // A bracket under the words from one end to the other, a line per line of text it crosses. Its ends tick up; where it carries on
    // to the next line, the line ends with a short turn down past its last word and the next starts with the same turn coming in, so
    // the halves read as one bracket. Right to left, the first word is on the right.
    for (const [first, last] of shape.frames) {
      const rows = new Map();
      for (let i = first; i <= last; i++) {
        const r = at(i);
        const key = Math.round(r.bottom);
        const row = rows.get(key) ?? { left: r.left, right: r.right, bottom: r.bottom };
        row.left = Math.min(row.left, r.left);
        row.right = Math.max(row.right, r.right);
        rows.set(key, row);
      }
      const all = [...rows.values()];
      const s = rtl ? -1 : 1;
      all.forEach((row, n) => {
        const y = row.bottom + 5;
        const startX = rtl ? row.right : row.left;
        const endX = rtl ? row.left : row.right;
        const start = n === 0 ? `M ${startX + s} ${y - 6} L ${startX + s} ${y}` : `M ${startX - 8 * s} ${y - 7} Q ${startX - 8 * s} ${y} ${startX - s} ${y}`;
        const end = n === all.length - 1 ? ` L ${endX - s} ${y} L ${endX - s} ${y - 6}` : ` L ${endX + s} ${y} Q ${endX + 8 * s} ${y} ${endX + 8 * s} ${y + 7}`;
        path(`${start}${end}`, "lx-rule-bracket");
      });
    }

    // The parts of the lit word's clause, numbered under their middles, up to the one after it (the count a first or second place needs);
    // a word that comes last says "last" instead.
    const places = shape.places;
    if (places) {
      const last = places.place === "last";
      const shown = last ? [[places.parts[places.mark], places.mark]] : places.parts.slice(0, places.mark + 2).map((part, n) => [part, n]);
      for (const [[a, b], n] of shown) {
        const first = at(a);
        let left = first.left, right = first.right;
        for (let i = a + 1; i <= b; i++) {
          const r = at(i);
          if (Math.abs(r.bottom - first.bottom) < 4) (left = Math.min(left, r.left)), (right = Math.max(right, r.right));
        }
        const x = (left + right) / 2, y = first.bottom + 16;
        if (n === places.mark && !last) path(`M ${x - 10} ${y - 4} A 10 10 0 1 0 ${x + 10} ${y - 4} A 10 10 0 1 0 ${x - 10} ${y - 4}`, "lx-rule-ring");
        label(x, y, last ? t("study.picture.last") : formatNumber(n + 1), n === places.mark);
      }
    }

    // An arc over the line from one word to another (on one line of text; across lines, the lit words say it alone), an end on its
    // characters when it has them.
    for (const { from, to, fromChars, toChars } of shape.links) {
      const a = charsAt(from, fromChars), b = charsAt(to, toChars);
      if (Math.abs(a.bottom - b.bottom) > 4) continue;
      const lift = Math.min(24, Math.abs(b.mid - a.mid) / 3 + 10);
      path(`M ${a.mid} ${a.top + 2} C ${a.mid} ${a.top - lift}, ${b.mid} ${b.top - lift}, ${b.mid} ${b.top + 2}`, "lx-rule-arc");
    }

    // A rounded box around words that go together.
    for (const [first, last] of shape.boxes) {
      const a = at(first), b = at(last);
      if (Math.abs(a.bottom - b.bottom) > 4) continue;
      const left = Math.min(a.left, b.left) - 4, right = Math.max(a.right, b.right) + 4, top = Math.min(a.top, b.top) - 2, bottom = Math.max(a.bottom, b.bottom) + 3;
      const r = 9;
      path(`M ${left + r} ${top} H ${right - r} Q ${right} ${top} ${right} ${top + r} V ${bottom - r} Q ${right} ${bottom} ${right - r} ${bottom} H ${left + r} Q ${left} ${bottom} ${left} ${bottom - r} V ${top + r} Q ${left} ${top} ${left + r} ${top} Z`, "lx-rule-box");
    }

    // Without the Highlight API: an underline under each affix's letters, from the range's own rects.
    if (!highlighting)
      for (const range of ranges)
        for (const r of range.getClientRects()) {
          const { left, right, bottom } = rect(r);
          path(`M ${left} ${bottom + 1} L ${right} ${bottom + 1}`, "lx-rule-affix-line");
        }

    // A small label over a word: what a particle does.
    for (const { word, text: value } of shape.tags) {
      const a = at(word);
      label(a.mid, a.top - 4, value, true, "lx-rule-tag");
    }
    drawIn();
  };

  // The sentence on one line where it can: a step smaller at a time, down to a floor that still reads (22 px at the usual text size). A
  // longer one wraps at that floor, and its shape carries across the lines.
  const SCALES = [1.2, 1.15, 1.1];
  const oneLine = () => spans.every((span) => Math.abs(span.getBoundingClientRect().top - spans[0].getBoundingClientRect().top) < 4);
  const fit = () => {
    for (const scale of SCALES) {
      line.style.setProperty("--rule-scale", String(scale));
      if (oneLine()) return;
    }
  };
  // What a frame does once the picture is on the page: its affixes colored from here on, the sentence fitted when its width has changed,
  // the shape drawn from the words where they are now.
  let width = 0;
  let kept = false;
  const lay = () => {
    if (!kept) keep();
    kept = true;
    const now = line.getBoundingClientRect().width;
    if (now !== width) (width = now), fit();
    draw();
  };
  // Measured again when the width changes (a turned phone, a bigger text size); drawn again on any change, a frame later, so a change
  // it makes itself is never measured in the same frame. Off the page, its affixes stop being colored.
  // Watched from the start, so a picture built before it's on the page (Knowledge builds its idea cards a few at a time) is fitted and
  // drawn on the frame after it gets its size there. It used to be looked at once, on the frame after it was built, and one not on the
  // page by then was never fitted, drawn or watched: the same card came out at one size or another, with its shape or without, by timing.
  // (Chrome reports once on a picture that isn't on the page yet: that one goes on being watched; only one that has been on the page and
  // left it is let go.)
  const observer = new ResizeObserver(() =>
    requestAnimationFrame(() => {
      if (figure.isConnected) return lay();
      if (kept) drop(), observer.disconnect();
    }),
  );
  observer.observe(figure);
  // One already on the page is fitted on its first frame, before it's ever shown at another size.
  requestAnimationFrame(() => {
    if (figure.isConnected) lay();
  });

  // Once, as the sheet opens (after: how long until it's up): the lit words come up in turn, then the shape draws itself along its length.
  // Everything starts held at its first frame, so nothing shows finished before it draws in, and a redraw while it plays (the first
  // measure, a font arriving) keeps drawing in. Decoration only: it takes no presses, and with animations off it's simply there.
  let playAt = null;
  let shapeAfter = 0;
  let labelsAfter = 0;
  drawIn = () => {
    if (playAt == null) return;
    const elapsed = performance.now() - playAt;
    labels.forEach((node, n) => {
      const delay = labelsAfter + n * 60 - elapsed;
      if (delay + 260 > 0) motion.animate(node, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: Math.max(0, delay), fill: "backwards" });
    });
    // One stroke after another (a bracket's line on each line of text, the boxes in turn).
    drawn.forEach((p, n) => {
      const delay = shapeAfter + n * 320 - elapsed;
      const length = p.getTotalLength?.() || 0;
      if (length && delay + 440 > 0) motion.animate(p, [{ strokeDasharray: `${length}`, strokeDashoffset: `${length}` }, { strokeDasharray: `${length}`, strokeDashoffset: "0" }], { duration: 440, delay: Math.max(0, delay), fill: "backwards" });
    });
  };
  const play = (after = 0) =>
    requestAnimationFrame(() => {
      if (!figure.isConnected || playAt != null) return;
      playAt = performance.now();
      const litNow = spans.filter((span) => span.hasAttribute("data-lit") || span.hasAttribute("data-piece"));
      litNow.forEach((span, n) => motion.animate(span, [{ backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%" }], { duration: 320, delay: after + 120 + n * 140, fill: "backwards" }));
      labelsAfter = after + 80;
      shapeAfter = after + 160 + litNow.length * 140;
      draw();
    });
  return { node: figure, play };
}

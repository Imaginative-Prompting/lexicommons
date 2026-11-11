// Generated from the character's rig (08-lexicommons/docs/design/character/rig/kit/speech.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Speaking: a mouth that says what's being said, so the character can say the app's sentences (the plan:
// ../../voice-plan.md). Pure functions, like the rest of the kit.
//
// - VISEMES: the mouth shapes, as parameters of one mouth (so any two blend: no popping):
//     w (width, 1 = its resting smile's), open (0 shut … 1 wide), round (0 spread … 1 a round O), teeth (the top
//     teeth showing), tongue (raised to the teeth, for L/T/D/N), tuck (the lower lip under the teeth, for F/V).
// - shapesOf(word, lang): a word's letters as mouth shapes, by writing system, each with a weight (vowels hold longer).
// - speechTrack(words, opts): from timed words ([{ text, start, end }], seconds) to the mouth's parameters at any time,
//   led a frame ahead of the sound as lip sync is; `envelope` (the sound's loudness, 0–1, at `rate` per second) opens
//   and closes it with the real rhythm when there is a recording.
// - speakingMouth({ c, w, angle, params }, pal): the mouth drawn, from shut (its smile's line) to wide open.
// - loudness(samples, sampleRate, rate): a recording's loudness for speechTrack's envelope (the app decodes the clip on
//   the device, the reels with ffmpeg: the same numbers either way).
// - estimateWords(texts, { rate }): timings for words that have none (a device voice), from their length.

import { add, clamp, ellipse, f2, lerp, rot, smoothPath } from "./geom.js";

export const VISEMES = {
  rest: { w: 1, open: 0, round: 0, teeth: 0, tongue: 0, tuck: 0 },
  MBP: { w: 0.92, open: 0, round: 0.1, teeth: 0, tongue: 0, tuck: 0 },
  A: { w: 1.25, open: 1, round: 0.12, teeth: 0.35, tongue: 0.1, tuck: 0 },
  E: { w: 1.32, open: 0.55, round: 0, teeth: 0.8, tongue: 0.1, tuck: 0 },
  I: { w: 1.38, open: 0.3, round: 0, teeth: 0.9, tongue: 0, tuck: 0 },
  O: { w: 0.98, open: 0.85, round: 0.85, teeth: 0.15, tongue: 0, tuck: 0 },
  U: { w: 0.76, open: 0.45, round: 1, teeth: 0, tongue: 0, tuck: 0 },
  FV: { w: 1.05, open: 0.24, round: 0, teeth: 1, tongue: 0, tuck: 1 },
  L: { w: 1.05, open: 0.6, round: 0.1, teeth: 0.5, tongue: 1, tuck: 0 },
  S: { w: 1.2, open: 0.16, round: 0, teeth: 1, tongue: 0, tuck: 0 },
  K: { w: 1.08, open: 0.42, round: 0.1, teeth: 0.3, tongue: 0.2, tuck: 0 },
};
const KEYS = ["w", "open", "round", "teeth", "tongue", "tuck"];
const mix = (a, b, u) => Object.fromEntries(KEYS.map((k) => [k, lerp(a[k], b[k], u)]));

// ---- letters to shapes ---------------------------------------------------------------------------------------------

const LATIN = [
  // Digraphs first (longest match): a few per language family, then single letters.
  ["sch", ["S", "K"]], ["tsch", ["S"]], ["ch", ["S"]], ["sh", ["S"]], ["th", ["L"]], ["ph", ["FV"]], ["qu", ["K", "U"]],
  ["ij", ["E", "I"]], ["ei", ["E", "I"]], ["ui", ["O", "I"]], ["oe", ["U"]], ["ou", ["U"]], ["au", ["A", "U"]],
  ["eu", ["O"]], ["aa", ["A"]], ["ee", ["E"]], ["oo", ["O"]], ["ie", ["I"]], ["ng", ["K"]], ["nh", ["L"]], ["lh", ["L"]],
  ["a", ["A"]], ["e", ["E"]], ["i", ["I"]], ["y", ["I"]], ["o", ["O"]], ["u", ["U"]], ["w", ["U"]],
  ["m", ["MBP"]], ["b", ["MBP"]], ["p", ["MBP"]], ["f", ["FV"]], ["v", ["FV"]],
  ["l", ["L"]], ["n", ["L"]], ["t", ["L"]], ["d", ["L"]], ["r", ["L"]],
  ["s", ["S"]], ["z", ["S"]], ["c", ["S"]], ["j", ["S"]], ["x", ["S"]], ["ç", ["S"]], ["ß", ["S"]],
  ["k", ["K"]], ["g", ["K"]], ["h", ["K"]], ["q", ["K"]],
];
const CYRILLIC = { а: "A", я: "A", о: "O", ё: "O", у: "U", ю: "U", э: "E", е: "E", є: "E", и: "I", і: "I", ї: "I", ы: "I", й: "I",
  м: "MBP", б: "MBP", п: "MBP", ф: "FV", в: "FV", л: "L", н: "L", т: "L", д: "L", р: "L", с: "S", з: "S", ш: "S", щ: "S", ж: "S", ч: "S", ц: "S", к: "K", г: "K", х: "K", ґ: "K" };
const GREEK = { α: "A", ο: "O", ω: "O", υ: "I", ε: "E", η: "I", ι: "I", μ: "MBP", π: "MBP", β: "FV", φ: "FV", λ: "L", ν: "L", τ: "L", δ: "L", ρ: "L", θ: "L", σ: "S", ς: "S", ζ: "S", ξ: "S", ψ: "S", κ: "K", γ: "K", χ: "K" };
// Kana by its vowel (each kana a syllable: its consonant then its vowel).
const KANA_ROWS = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわを";
const KANA_V = ["A", "I", "U", "E", "O"];
const KANA_SMALL = { ぁ: "A", ぃ: "I", ぅ: "U", ぇ: "E", ぉ: "O", ゃ: "A", ゅ: "U", ょ: "O" };
const kanaShape = (ch) => {
  let c = ch.codePointAt(0);
  if (c >= 0x30a1 && c <= 0x30f6) c -= 0x60; // katakana → hiragana
  const h = String.fromCodePoint(c);
  if (h === "ん") return ["L"];
  if (h === "っ") return [];                 // a held stop: no shape of its own
  if (KANA_SMALL[h]) return [KANA_SMALL[h]];
  const base = h.normalize("NFD")[0];
  const i = KANA_ROWS.indexOf(base);
  if (i < 0) return null;
  // Rows: a, k, s, t, n, h, m (five each), y (ya yu yo), r (five), w (wa wo).
  const consonant = i < 5 ? null : i < 10 ? "K" : i < 15 ? "S" : i < 25 ? "L" : i < 30 ? "K" : i < 35 ? "MBP" : i < 38 ? null : i < 43 ? "L" : "U";
  const vowel = i < 35 ? KANA_V[i % 5] : i < 38 ? ["A", "U", "O"][i - 35] : i < 43 ? KANA_V[i - 38] : i === 43 ? "A" : "O";
  return consonant ? [consonant, vowel] : [vowel];
};
// Hangul: each block's vowel (its medial jamo).
const HANGUL_V = ["A", "E", "A", "E", "O", "E", "O", "E", "O", "A", "E", "E", "O", "U", "O", "E", "I", "U", "U", "I", "I"];
const hangulShape = (ch) => {
  const s = ch.codePointAt(0) - 0xac00;
  if (s < 0 || s > 11171) return null;
  const initial = Math.floor(s / 588), medial = Math.floor((s % 588) / 28);
  const lead = [6, 7, 8, 17].includes(initial) ? "MBP" : [11].includes(initial) ? null : [9, 10, 12, 13, 14].includes(initial) ? "S" : [2, 3, 4, 5, 16].includes(initial) ? "L" : "K";
  return lead ? [lead, HANGUL_V[medial]] : [HANGUL_V[medial]];
};

/** A word's mouth shapes: [{ v: viseme, weight }]. Vowels weigh 2, consonants 1. */
export function shapesOf(word, lang = "") {
  const out = [];
  const push = (v) => out.push({ v, weight: ["A", "E", "I", "O", "U"].includes(v) ? 2 : 1 });
  const text = word.toLowerCase().normalize("NFC");
  // The same word with Latin accents dropped, letter for letter (each NFC letter strips to one), for matching rules.
  const plain = [...text].map((ch) => ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "") || ch).join("");
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    const cp = ch.codePointAt(0);
    if (/[a-z\u00df-\u00ff]/.test(ch) || (cp >= 0x100 && cp < 0x250)) {
      const rule = LATIN.find(([g]) => plain.startsWith(g, i));
      if (rule) rule[1].forEach(push);
      i += rule ? rule[0].length : 1;
      continue;
    }
    if (CYRILLIC[ch]) { push(CYRILLIC[ch]); i++; continue; }
    const g = ch.normalize("NFD")[0];
    if (GREEK[g]) { push(GREEK[g]); i++; continue; }
    if (ch === "ー" && out.length) { push(out[out.length - 1].v); i++; continue; }
    const kana = kanaShape(ch);
    if (kana) { kana.forEach(push); i++; continue; }
    const hangul = hangulShape(ch);
    if (hangul) { hangul.forEach(push); i++; continue; }
    if (cp >= 0x4e00 && cp <= 0x9fff) { push("K"); push("A"); i++; continue; } // a Han character: a syllable, opening and closing
    if (cp >= 0x0600 && cp <= 0x06ff || cp >= 0x0590 && cp <= 0x05ff) {
      // Arabic and Hebrew: their vowel marks when the text has them, else a consonant and an opening each.
      const mark = { "َ": "A", "ُ": "U", "ِ": "I", "ַ": "A", "ָ": "A", "ִ": "I", "ֹ": "O", "ֻ": "U", "ֵ": "E", "ֶ": "E" }[ch];
      if (mark) { out.length && out[out.length - 1].v === "A" ? (out[out.length - 1] = { v: mark, weight: 2 }) : push(mark); i++; continue; }
      if (/[ء-يא-ת]/.test(ch)) { push("K"); push("A"); }
      i++;
      continue;
    }
    if (/\p{L}/u.test(ch)) { push("K"); push("A"); } // any other letter: an opening
    i++;
  }
  return out.length ? out : [{ v: "A", weight: 2 }];
}

// ---- a timed track ---------------------------------------------------------------------------------------------------

/**
 * words: [{ text, start, end }] in seconds (a recording's manifest gives these; a device voice's boundaries give the
 * starts and its estimate the ends). Returns { at(t) → params, end }.
 * envelope: the sound's loudness (0–1) sampled `rate` times a second, from the recording itself; it opens and closes
 * the mouth with the real rhythm. lead: how far the mouth runs ahead of the sound.
 */
export function speechTrack(words, { lang = "", envelope = null, rate = 100, lead = 0.035 } = {}) {
  const keys = [];
  for (const w of words) {
    const shapes = shapesOf(w.text, lang);
    const total = shapes.reduce((s, x) => s + x.weight, 0);
    const dur = Math.max(0.04, w.end - w.start);
    let at = w.start;
    for (const s of shapes) {
      const d = (dur * s.weight) / total;
      // Pressed lips and lip-under-teeth must be seen: they hold at least two frames. A vowel opens for at least a
      // frame, so a quick word ("heb", 53 ms in a recording) still opens the mouth at 30 frames a second.
      keys.push({ t0: at, t1: at + Math.max(d, s.v === "MBP" || s.v === "FV" ? 0.066 : s.weight > 1 ? 0.04 : 0), v: s.v });
      at += d;
    }
  }
  const end = words.length ? words[words.length - 1].end : 0;
  const loud = (t) => {
    if (!envelope) return 1;
    const i = t * rate, a = Math.floor(i);
    if (a < 0 || a >= envelope.length - 1) return 0;
    return lerp(envelope[a], envelope[a + 1], i - a);
  };
  return {
    end,
    at(t) {
      const u = t + lead;
      // Between words (a pause over 0.12 s) and before and after: resting.
      const k = keys.findIndex((x) => u >= x.t0 && u < x.t1);
      if (k < 0) {
        const next = keys.find((x) => x.t0 > u), prev = [...keys].reverse().find((x) => x.t1 <= u);
        if (prev && next && next.t0 - prev.t1 < 0.12) return mix(VISEMES[prev.v], VISEMES[next.v], (u - prev.t1) / (next.t0 - prev.t1));
        // Closing after a word, or opening into the next: 60 ms either way.
        if (prev && u - prev.t1 < 0.06) return mix(VISEMES[prev.v], VISEMES.rest, (u - prev.t1) / 0.06);
        if (next && next.t0 - u < 0.06) return mix(VISEMES.rest, VISEMES[next.v], 1 - (next.t0 - u) / 0.06);
        return { ...VISEMES.rest };
      }
      // Within a shape: it blends into the next over the last 40% of its time (coarticulation).
      const cur = keys[k], nxt = keys[k + 1];
      const span = cur.t1 - cur.t0, into = (u - cur.t0) / span;
      let p = { ...VISEMES[cur.v] };
      if (nxt && nxt.t0 - cur.t1 < 0.02 && into > 0.6) p = mix(p, VISEMES[nxt.v], ((into - 0.6) / 0.4) ** 2 * 0.6);
      // The recording's loudness opens and closes it; silence closes it.
      const l = loud(t);
      p.open *= envelope ? clamp(0.25 + 0.95 * l, 0, 1.1) * (l < 0.04 ? l / 0.04 : 1) : 1;
      return p;
    },
  };
}

/**
 * A recording's loudness, 0–1, `rate` times a second: the RMS over each 1/rate s, lightly smoothed, then normalized to
 * its 95th percentile (one peak doesn't make the rest look quiet). samples: mono, at sampleRate.
 */
export function loudness(samples, sampleRate, rate = 100) {
  const hop = sampleRate / rate, out = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let e = 0;
    for (let k = 0; k < hop; k++) e += samples[Math.floor(i + k)] ** 2;
    out.push(Math.sqrt(e / hop));
  }
  const sm = out.map((_, i) => (out[Math.max(0, i - 1)] + 2 * out[i] + out[Math.min(out.length - 1, i + 1)]) / 4);
  const top = [...sm].sort((a, b) => a - b)[Math.floor(sm.length * 0.95)] || 1;
  return sm.map((v) => Math.min(1, v / top));
}

/**
 * Timings for words that have none (a device voice before its first boundary, or one that never reports any): each
 * word 80 ms plus 75 ms a letter, 60 ms apart, at the voice's rate. texts: what's said (the reading, where a language
 * shows one). Returns [{ text, start, end }].
 */
export function estimateWords(texts, { rate = 1 } = {}) {
  let t = 0;
  return texts.map((text) => {
    const d = (0.08 + 0.075 * [...text].length) / rate;
    const w = { text, start: t, end: t + d };
    t += d + 0.06 / rate;
    return w;
  });
}

// ---- the mouth -------------------------------------------------------------------------------------------------------

/**
 * The speaking mouth at c (y up), w its resting smile's width (units), turned by angle: an opening whose top edge keeps
 * the smile's curve, deeper and rounder as it opens, with top teeth, a tongue and the lower lip that tucks for F/V.
 * Shut, it's a sliver along the smile, so starting and stopping never jump. pal: { mouth, tongue, white }.
 */
export function speakingMouth({ c, w, angle = 0, params, tongue = "none" }, pal) {
  const P = params;
  const R = (q) => rot(add(c, q), angle, c);
  const hw = (w / 2) * P.w * (1 - 0.3 * P.round);
  const lip = Math.max(0.7, w * 0.1);                       // the closed mouth's thickness: the smile line's
  const depth = w * 0.82 * P.open;                          // how far it opens, down from its top edge
  const smileDip = w * 0.16 * (1 - P.round) * (1 - 0.5 * P.open);
  const N = 18, top = [], bottom = [];
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    // Round mouths curve the top edge too; spread ones keep the smile's.
    const topY = -smileDip * (1 - u * u) + P.round * depth * 0.35 * (1 - Math.abs(u) ** 2);
    const lens = Math.sqrt(Math.max(0, 1 - u * u)) ** (1.2 - 0.6 * P.round);
    const botY = topY - lip * (0.5 + 0.5 * Math.sqrt(Math.max(0, 1 - u * u))) - depth * lens * (1 - 0.65 * P.tuck);
    top.push([u * hw, topY]);
    bottom.push([u * hw, botY]);
  }
  const shape = [...top, ...bottom.reverse()].map(R);
  const id = `sp${speakId++}`;
  let s = `<clipPath id="${id}"><path d="${smoothPath(shape)}"/></clipPath><path d="${smoothPath(shape)}" fill="${pal.mouth}"/>`;
  const inner = [];
  if (P.open > 0.06) {
    const teeth = clamp(P.teeth, 0, 1) * Math.min(depth * 0.45, w * 0.32);
    if (teeth > 0.2) inner.push(`<path d="${smoothPath(top.map(([x, y]) => [x * 1.1, y + 1]).concat(top.slice().reverse().map(([x, y]) => [x * 1.1, y - teeth])).map(R))}" fill="${pal.white}"/>`);
    // The tongue: none by default, the mouth reads better without one. "light" (in the light ink)
    // and "shade" (in the body's deep shade, only its top showing) stay for comparison stills.
    if (tongue !== "none") {
      const ty = lerp(-lip - depth * 0.95, -lip - depth * 0.25, P.tongue);
      const tc = R([hw * 0.12, ty - (tongue === "shade" ? depth * 0.12 : 0)]);
      inner.push(`<path d="${smoothPath(ellipse(tc[0], tc[1], hw * (tongue === "shade" ? 0.5 : 0.62), Math.max(0.6, depth * (tongue === "shade" ? 0.3 : 0.38)), 24, angle))}" fill="${tongue === "shade" ? pal.shade : pal.tongue}"/>`);
    }
  }
  if (inner.length) s += `<g clip-path="url(#${id})">${inner.join("")}</g>`;
  return s;
}
let speakId = 0;

export { f2 };

// What an Anki field says, as plain text. A field can hold any HTML and a card's template any JavaScript, and neither ever
// runs or renders here: there's no DOM in this file, the markup is walked as text, and what comes out is only ever shown as
// text. Everything's linear in the field's length, so a crafted field can't stall it.

const DROPPED = ["script", "style", "head", "title", "svg", "math", "object", "embed", "iframe", "template", "noscript", "audio", "video", "canvas", "applet", "frame", "frameset", "xmp", "noembed", "noframes", "textarea", "select", "marquee"];
const DROPPED_END = new Map(DROPPED.map((name) => [name, new RegExp(`</${name}\\s*>`, "gi")]));
const BREAKS = new Set(["br", "hr", "div", "p", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "section", "article", "blockquote", "pre", "dd", "dt", "center"]);
const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "", ensp: " ", emsp: " ", thinsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", iexcl: "¡", iquest: "¿", middot: "·", deg: "°", euro: "€", pound: "£", copy: "©", szlig: "ß", aelig: "æ", AElig: "Æ", oelig: "œ", OElig: "Œ", oslash: "ø", Oslash: "Ø", aring: "å", Aring: "Å", ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ", eth: "ð", ETH: "Ð", thorn: "þ", THORN: "Þ",
};
for (const [mark, letters] of Object.entries({ acute: "aeiouyAEIOUY", grave: "aeiouAEIOU", circ: "aeiouAEIOU", uml: "aeiouyAEIOU", tilde: "aonAON" })) for (const letter of letters) NAMED[`${letter}${mark}`] = `${letter}${{ acute: "́", grave: "̀", circ: "̂", uml: "̈", tilde: "̃" }[mark]}`.normalize("NFC");

/** Character references as the characters they name: a code that isn't a character stays as written. */
export function decodeEntities(text) {
  if (!text.includes("&")) return text;
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,8}));?/g, (whole, decimal, hex, name) => {
    if (name) return Object.hasOwn(NAMED, name) ? NAMED[name] : whole;
    const code = decimal ? Number(decimal) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}

// Where a tag ends: the > outside its quotes, or -1.
function tagEnd(text, from) {
  let quote = "";
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/y;

/** Markup walked as text: tags gone, what shouldn't be read gone with its contents. Tells whether it held a picture. */
export function stripMarkup(html) {
  const out = [];
  let picture = false;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out.push(html.slice(i));
      break;
    }
    out.push(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    TAG.lastIndex = lt;
    const match = TAG.exec(html);
    if (!match) {
      // A plain "<", as in "a < b".
      out.push("<");
      i = lt + 1;
      continue;
    }
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const end = tagEnd(html, lt + match[0].length);
    if (end < 0) break; // A tag that never ends takes the rest with it.
    i = end + 1;
    if (name === "img") picture = true;
    if (BREAKS.has(name)) out.push(" ");
    const until = closing ? null : DROPPED_END.get(name);
    if (until) {
      until.lastIndex = i;
      const stop = until.exec(html);
      i = stop ? stop.index + stop[0].length : html.length;
    }
  }
  return { text: out.join(""), picture };
}

const SOUND = /\[sound:([^\]\n]{1,300})\]/g;
const PLAY = /\[anki:play:[^\]]{0,40}\]/g;
const MATH = /\[latex\]|\[\$\$?\]|\\\(|\\\[/;

/**
 * A field as plain text:
 *   text     its words, on one line
 *   sounds   the files it plays
 *   picture  it shows a picture (they don't come across)
 *   math     it's written in LaTeX, which isn't shown here
 */
export function plainField(raw) {
  const sounds = [];
  const unsounded = String(raw)
    .replace(SOUND, (_, name) => {
      sounds.push(decodeEntities(name).trim());
      return " ";
    })
    .replace(PLAY, " ");
  const { text, picture } = stripMarkup(unsounded);
  const decoded = decodeEntities(text);
  return { text: decoded.replace(/[\u0000-\u001f\u007f \s]+/g, " ").trim(), sounds, picture, math: MATH.test(decoded) };
}

/** Anki's furigana (日本語[にほんご]) as just the words and as how they're said. For a field its template reads that way. */
export function furigana(text) {
  let written = "";
  let said = "";
  let last = 0;
  let any = false;
  for (let open = text.indexOf("["); open >= 0; open = text.indexOf("[", open + 1)) {
    const close = text.indexOf("]", open);
    if (close < 0) break;
    const inner = text.slice(open + 1, close);
    if (inner.includes("[") || inner.includes("\n")) continue;
    // The word it reads: back to a space or a bracket. A bracket ends the look back, so the whole walk stays linear.
    let start = open;
    while (start > last && !/[\s[\]]/.test(text[start - 1])) start--;
    if (start === open) continue;
    // A space before the word only marks where it starts.
    const before = text.slice(last, start).replace(/ $/, "");
    written += before + text.slice(start, open);
    said += before + inner;
    last = close + 1;
    open = close;
    any = true;
  }
  return { written: written + text.slice(last), said: any ? said + text.slice(last) : "" };
}

/**
 * A cloze field's parts, in order: { text } or { ord, answer, hint }. Null when it has no cloze, or one inside another
 * (which can't be asked one at a time). Nothing's rebuilt from it by pasting it into markup: it's already plain text.
 */
export function clozeParts(text) {
  const opening = /\{\{c(\d{1,3})::/g;
  const parts = [];
  let last = 0;
  let found = false;
  let match;
  while ((match = opening.exec(text))) {
    const start = match.index + match[0].length;
    const close = text.indexOf("}}", start);
    if (close < 0) return null;
    const inner = text.slice(start, close);
    if (inner.includes("{{")) return null;
    const sep = inner.indexOf("::");
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ ord: Number(match[1]), answer: (sep < 0 ? inner : inner.slice(0, sep)).trim(), hint: sep < 0 ? "" : inner.slice(sep + 2).trim() });
    last = close + 2;
    opening.lastIndex = last;
    found = true;
  }
  if (!found) return null;
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const SPECIAL = new Set(["FrontSide", "Tags", "Type", "Deck", "Subdeck", "CardFlag", "Card", "CardID"]);
const FIELD_REF = /\{\{([^{}]{1,200})\}\}/g;
const TTS_TAG = /\[anki:tts[^\]]*\blang=([A-Za-z_-]{2,12})[^\]]*\]\s*(?:\{\{([^{}]{1,200})\}\})/g;

/**
 * Which fields one side of a template names, read as text and never run: [{ field, filters, tts }]. filters: furigana,
 * cloze, type, tts and so on; tts: the locale the template reads it aloud in ("nl_NL"), when it says.
 */
export function templateFields(template) {
  if (typeof template !== "string" || template.length > 200_000) return [];
  const seen = new Map();
  for (const match of template.matchAll(FIELD_REF)) {
    const inner = match[1].trim();
    if (/^[#^/!]/.test(inner)) continue;
    const parts = inner.split(":").map((part) => part.trim());
    const field = parts.pop();
    if (!field || SPECIAL.has(field)) continue;
    const entry = seen.get(field) ?? { field, filters: [], tts: "" };
    for (const filter of parts) {
      const tts = /^tts\s+([A-Za-z_-]{2,12})/.exec(filter);
      if (tts) entry.tts = tts[1];
      entry.filters.push(filter.split(/\s/)[0].toLowerCase());
    }
    seen.set(field, entry);
  }
  for (const match of template.matchAll(TTS_TAG)) {
    const field = match[2].trim().split(":").pop().trim();
    if (seen.has(field)) seen.get(field).tts = match[1];
  }
  return [...seen.values()];
}

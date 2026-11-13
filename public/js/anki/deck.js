// From an Anki collection to a pack's cards: which of a note type's fields is which, plain text out of each field, a card per
// note (a cloze note, one per gap), and a plain count of everything left out and why. The pack it builds goes through the
// same check as any other (pack-format.js, on the device and on the server). Pure: no DOM, no storage.

import { ITEM_LIMITS, gamesOf, itemOthers, orderedItem } from "../study/pack-items.js";
import { clozeParts, furigana, plainField, stripMarkup, decodeEntities, templateFields } from "./text.js";
import { CAPS } from "./zip.js";
import { codeOfLocale, detectLanguage, languagesNamed } from "./language.js";

const WORD_FIELD = /^(word|vocab|vocabulary|term|expression|front|question|kanji|hanzi|target|lemma|headword|phrase)\b/i;
const MEANING = /(meaning|translation|english|definition|gloss|\bback\b|answer|betekenis|bedeutung|signification|significado|traducci|vertaling|übersetzung|翻译|翻譯|意味|뜻)/i;
const READING = /(reading|furigana|\bkana\b|pinyin|romaji|\bipa\b|pronunciation|transcription|zhuyin|bopomofo|jyutping|yomi|aussprache|uitspraak)/i;
const SENTENCE = /(sentence|example|\bzin\b|\bsatz\b|\bfrase\b|\bphrase\b|beispiel|voorbeeld|ejemplo|exemple|例文|例句|문장)/i;
const AUDIO = /(audio|sound|recording|\btts\b|voice|\bmp3\b)/i;
const NOISE = /(\btags?\b|\bnotes?\b|\bhint\b|source|image|picture|\bpic\b|photo|\bextra\b|remark|comment|frequency|\brank\b|grammar|\bpos\b|part of speech|\bid\b|\bindex\b|\burl\b|\blink\b|mnemonic|pitch|context|lesson|chapter|\blevel\b|\bjlpt\b|\bhsk\b|stroke|radical|\bnumber\b|\bsort\b)/i;

/** Which field of a note type is which, by what its template shows on each side and by each field's name. */
export function rolesOf(type) {
  const template = type.templates[0] ?? { q: "", a: "" };
  const qs = templateFields(template.q);
  const as = templateFields(template.a);
  const known = (entry) => type.fields.includes(entry.field);
  const qNames = qs.filter(known).map((entry) => entry.field);
  const aNames = as.filter((entry) => known(entry) && !qNames.includes(entry.field)).map((entry) => entry.field);
  const index = (name) => type.fields.indexOf(name);
  const kind = (name) => {
    if (SENTENCE.test(name) && (READING.test(name) || AUDIO.test(name))) return AUDIO.test(name) ? "sentenceAudio" : "noise";
    if (AUDIO.test(name)) return "audio";
    if (SENTENCE.test(name) && MEANING.test(name)) return "sentenceBack";
    if (SENTENCE.test(name)) return "sentence";
    if (READING.test(name)) return "reading";
    if (MEANING.test(name)) return "meaning";
    if (NOISE.test(name)) return "noise";
    return "plain";
  };
  const kinds = new Map(type.fields.map((name) => [name, kind(name)]));
  const textual = (name) => ["plain", "meaning"].includes(kinds.get(name));
  // The front: the first plain field the question shows; the back: a field named as the meaning the answer shows, else its
  // first plain one. A template naming nothing we can read falls back on the fields' order.
  let front = qNames.find((name) => kinds.get(name) === "plain" || WORD_FIELD.test(name)) ?? qNames.find(textual);
  let back = aNames.find((name) => kinds.get(name) === "meaning") ?? aNames.find((name) => kinds.get(name) === "plain");
  const questionsMeaning = front !== undefined && kinds.get(front) === "meaning";
  if (front === undefined) front = type.fields.find((name) => kinds.get(name) === "plain") ?? type.fields.find((name) => kinds.get(name) === "sentence") ?? type.fields[0];
  if (back === undefined) back = type.fields.find((name) => name !== front && kinds.get(name) === "meaning") ?? type.fields.find((name) => name !== front && kinds.get(name) === "plain");
  const pick = (want) => type.fields.find((name) => kinds.get(name) === want);
  const reading = pick("reading");
  const usesFurigana = (name) => [...qs, ...as].some((entry) => entry.field === name && ["furigana", "kanji", "kana"].some((filter) => entry.filters.includes(filter)));
  const tts = (name) => [...qs, ...as].find((entry) => entry.field === name && entry.tts)?.tts ?? null;
  return {
    front: index(front),
    back: back === undefined ? -1 : index(back),
    questionsMeaning,
    reading: reading === undefined ? -1 : index(reading),
    sentence: index(pick("sentence") ?? ""),
    sentenceBack: index(pick("sentenceBack") ?? ""),
    audio: index(pick("audio") ?? ""),
    sentenceAudio: index(pick("sentenceAudio") ?? ""),
    frontFurigana: front !== undefined && usesFurigana(front),
    frontTts: codeOfLocale(tts(front)),
    backTts: back === undefined ? null : codeOfLocale(tts(back)),
    frontNames: front === undefined ? [] : languagesNamed(front),
    backNames: back === undefined ? [] : languagesNamed(back),
  };
}

const clip = (text, max) => (text.length > max ? null : text);
// What a deck's cards may come to, in JSON: a pack's limit is 2,000,000 bytes (pack-format.js), its name and about included.
const PACK_BYTES = 1_950_000;
const emptyTally = () => ({ pictureOnly: 0, noBack: 0, noFront: 0, math: 0, tooLong: 0, occlusion: 0, duplicate: 0, nestedCloze: 0, notes: 0, extrasLeft: 0 });

// Anki's own markers on a note, about your study and not about the card.
const STUDY_TAGS = new Set(["leech", "marked"]);
/** A note's tags as a card keeps them: plain words, its first few, no study markers. */
function tagsOf(raw) {
  const tags = [...new Set(String(raw ?? "").slice(0, 4000).trim().split(/\s+/).filter(Boolean))].filter((tag) => !STUDY_TAGS.has(tag.toLowerCase()) && tag.length <= ITEM_LIMITS.tag);
  return tags.slice(0, ITEM_LIMITS.tags);
}
/** Every other field of a note, with its name as its label: text only, never math, never one that's only a picture or a sound, nor what a side already says. */
function extrasOf(fields, type, used, sides, tally) {
  const extras = [];
  for (const [i, one] of fields.entries()) {
    // A side again, or a side with its readings on (furigana's brackets), adds nothing.
    if (used.has(i) || !one.text || one.math || sides.includes(one.text) || sides.includes(furigana(one.text).written)) continue;
    if (one.text.length > ITEM_LIMITS.side) {
      tally.extrasLeft++;
      continue;
    }
    const label = String(type.fields?.[i] ?? "").replace(/\s+/g, " ").trim().slice(0, ITEM_LIMITS.extraLabel) || `Field ${i + 1}`;
    if (extras.length < ITEM_LIMITS.extras) extras.push({ label, text: one.text });
    else tally.extrasLeft++;
  }
  return extras;
}
const moreOf = (note, fields, type, used, sides, tally) => {
  const extras = extrasOf(fields, type, used, sides, tally);
  const tags = tagsOf(note.tags);
  return { ...(extras.length ? { extras } : {}), ...(tags.length ? { tags } : {}) };
};

/** What a field holds, or { tooLong } when it's past what's worth reading. */
function field(raw) {
  if (typeof raw !== "string") return { text: "", sounds: [], picture: false, math: false };
  if (raw.length > CAPS.fieldChars) return { text: "", sounds: [], picture: false, math: false, tooLong: true };
  return plainField(raw);
}

function clozeCards(note, type, fields, tally) {
  const textIndex = fields.findIndex((one) => one.text.includes("{{c"));
  if (textIndex < 0) {
    tally.noFront++;
    return [];
  }
  const parts = clozeParts(fields[textIndex].text);
  if (!parts) {
    tally.nestedCloze++;
    return [];
  }
  const ords = [...new Set(parts.filter((part) => part.ord !== undefined).map((part) => part.ord))];
  const extraAt = fields.findIndex((one, i) => i !== textIndex && one.text && !one.math);
  const extra = extraAt >= 0 ? fields[extraAt].text : "";
  const more = moreOf(note, fields, type, new Set([textIndex, ...(extra && clip(extra, ITEM_LIMITS.side) ? [extraAt] : [])]), [], tally);
  const cards = [];
  for (const ord of ords) {
    // The gap is this ordinal's first part: Anki hides them all, but asking for several at once needs a game nobody built.
    let front = "";
    let at = -1;
    let answer = "";
    let hint = "";
    for (const part of parts) {
      if (part.ord === ord && at < 0) {
        at = front.length;
        answer = part.answer;
        hint = part.hint;
        front += part.answer;
      } else front += part.text ?? part.answer;
    }
    // Written as a pack keeps it: spaces trimmed from the ends move where the gap is.
    const lead = front.length - front.trimStart().length;
    const trimmed = front.trim();
    if (!answer || trimmed.length > ITEM_LIMITS.side || answer.length > ITEM_LIMITS.side) {
      tally.tooLong++;
      continue;
    }
    cards.push({
      id: `n${Number(note.id).toString(36)}-c${ord}`,
      front: trimmed,
      ...(extra && clip(extra, ITEM_LIMITS.side) ? { back: extra } : {}),
      cloze: { at: at - lead, answer, ...(hint && hint.length <= ITEM_LIMITS.hint ? { hint } : {}) },
      ...more,
      sounds: fields.flatMap((one) => one.sounds),
    });
  }
  return cards;
}

/** A note's cards, each with the sound it names; every note it can't use goes in tally, under why. */
export function cardsOfNote(note, type, roles, tally) {
  tally.notes++;
  const fields = note.raw.split("\x1f").map(field);
  if (/image occlusion/i.test(type.name)) {
    tally.occlusion++;
    return [];
  }
  if (fields.some((one) => one.tooLong)) {
    tally.tooLong++;
    return [];
  }
  if (type.cloze) return clozeCards(note, type, fields, tally);
  const frontField = fields[roles.front] ?? { text: "", sounds: [], picture: false, math: false };
  const backField = fields[roles.back] ?? { text: "", sounds: [], picture: false, math: false };
  let reading = fields[roles.reading]?.text ?? "";
  let front = frontField.text;
  if (roles.frontFurigana) {
    const { written, said } = furigana(front);
    front = written;
    if (said && !reading) reading = said;
  }
  // A field holding furigana's brackets as its reading: how it's said, without the writing.
  if (reading.includes("[")) reading = furigana(reading).said || reading;
  const back = backField.text;
  if (frontField.math || backField.math) {
    tally.math++;
    return [];
  }
  if (!front || !back) {
    if ((!front && frontField.picture) || (!back && backField.picture)) tally.pictureOnly++;
    else if (!front) tally.noFront++;
    else tally.noBack++;
    return [];
  }
  if (front.length > ITEM_LIMITS.side || back.length > ITEM_LIMITS.side) {
    tally.tooLong++;
    return [];
  }
  const sentence = fields[roles.sentence]?.text ?? "";
  const sentenceBack = fields[roles.sentenceBack]?.text ?? "";
  const hasSentence = sentence && sentenceBack && sentence.length <= ITEM_LIMITS.side && sentenceBack.length <= ITEM_LIMITS.side && sentence !== front;
  // The word's own sound first, else any sound its front or back plays, else its sentence's.
  const sounds = [...(fields[roles.audio]?.sounds ?? []), ...frontField.sounds, ...backField.sounds, ...(fields[roles.sentenceAudio]?.sounds ?? [])];
  // Everything else it carried. A sentence with no translation isn't a card's sentence, so it's one of these.
  const used = new Set([roles.front, roles.back, roles.reading, roles.audio, roles.sentenceAudio, ...(hasSentence ? [roles.sentence, roles.sentenceBack] : [])].filter((at) => at >= 0));
  const more = moreOf(note, fields, type, used, [front, back], tally);
  return [
    {
      id: `n${Number(note.id).toString(36)}`,
      front,
      back,
      ...(reading && reading !== front && reading.length <= ITEM_LIMITS.reading ? { reading } : {}),
      ...(hasSentence ? { sentence: furigana(sentence).written, sentenceBack } : {}),
      ...more,
      sounds,
    },
  ];
}

/**
 * The whole deck, as read from the collection: { name, description, cards, tally, total, language… }. Stops once it has
 * `keep` cards (a deck's first ones), counting the rest in leftOver. onProgress(done, total) says how far it's got.
 */
export function deckFrom(collection, { fileName = "", keep = ITEM_LIMITS.items, onProgress = () => {} } = {}) {
  const tally = emptyTally();
  let bytes = 0;
  const roles = new Map();
  for (const [id, type] of collection.types) roles.set(id, rolesOf(type));
  const cards = [];
  const seen = new Set();
  let leftOver = 0;
  let unknownType = 0;
  let read = 0;
  const fronts = [];
  const backs = [];
  const frontTts = new Map();
  const backTts = new Map();
  let frontNames = [];
  let backNames = [];
  for (const note of collection.notes()) {
    read++;
    if (read % 200 === 0) onProgress(read, collection.cards);
    if (cards.length >= keep || bytes >= PACK_BYTES) {
      leftOver++;
      continue;
    }
    const type = collection.types.get(note.type);
    if (!type) {
      unknownType++;
      continue;
    }
    const role = roles.get(note.type);
    for (const card of cardsOfNote(note, type, role, tally)) {
      const key = `${card.front}\n${card.back ?? ""}\n${card.cloze?.at ?? ""}`;
      if (seen.has(key)) {
        tally.duplicate++;
        continue;
      }
      seen.add(key);
      if (cards.length >= keep || bytes >= PACK_BYTES) {
        leftOver++;
        continue;
      }
      cards.push(card);
      // As it'll be kept (a pack has a size limit too), its sounds' names aside.
      bytes += JSON.stringify({ ...card, sounds: undefined, extras: undefined, tags: undefined }).length + 1;
      if (fronts.length < 400) {
        fronts.push(card.front);
        if (card.back) backs.push(card.back);
      }
      if (role.frontTts) frontTts.set(role.frontTts, (frontTts.get(role.frontTts) ?? 0) + 1);
      if (role.backTts) backTts.set(role.backTts, (backTts.get(role.backTts) ?? 0) + 1);
      if (!frontNames.length) frontNames = role.frontNames;
      if (!backNames.length) backNames = role.backNames;
    }
  }
  onProgress(read, collection.cards);
  // Its other fields and tags take what room the cards leave, first card first: they never cost a card.
  for (const card of cards) {
    if (!card.extras && !card.tags) continue;
    const size = JSON.stringify({ extras: card.extras, tags: card.tags }).length;
    if (bytes + size > PACK_BYTES) {
      tally.extrasLeft += card.extras?.length ?? 0;
      delete card.extras;
      delete card.tags;
    } else bytes += size;
  }
  const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const name = deckName(collection.deckName, fileName);
  const description = describeDeck(collection.description);
  const named = [name, ...[...collection.types.values()].map((type) => type.name)].flatMap(languagesNamed);
  const language = detectLanguage({ fronts, backs }, { frontTts: top(frontTts), backTts: top(backTts), frontNames, backNames, deckNames: named });
  const samples = cards.slice(0, 3).map((card) => ({ front: card.front, back: card.back ?? "" }));
  return { name, description, cards, tally: { ...tally, unknownType }, leftOver, total: collection.total, language, samples };
}

function deckName(name, fileName) {
  const cleaned = decodeEntities(stripMarkup(String(name ?? "").slice(0, 2000)).text).replace(/\s+/g, " ").trim();
  if (cleaned && !/^default$/i.test(cleaned)) return cleaned.slice(0, 80).trim();
  const base = String(fileName ?? "").replace(/\.(apkg|colpkg|zip)$/i, "").replace(/[_\s]+/g, " ").trim();
  return (base || "My Anki deck").slice(0, 80).trim();
}

// A deck's description as a pack's about: plain, on a line, under the limit at a sentence's end where it can be.
function describeDeck(description) {
  const { text } = stripMarkup(String(description ?? "").slice(0, CAPS.fieldChars));
  // A description is often Markdown: a link shows as its words and its address.
  const plain = decodeEntities(text).replace(/\[([^\]\n]{1,200})\]\((https?:[^)\s]{1,300})\)/g, "$1 ($2)").replace(/\s+/g, " ").trim();
  if (plain.length <= 400) return plain;
  const cut = plain.slice(0, 400);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > 100 ? cut.slice(0, end + 1) : `${cut.slice(0, 399).trimEnd()}…`).trim();
}

const fnv = (text) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

/** A deck's pack id: the same deck always the same, so adding it again replaces it and keeps what you've learned. */
export function packIdOf(name) {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return `anki-${slug ? `${slug}-` : ""}${fnv(name)}`.slice(0, 48);
}

/**
 * What's on each side once it's known which language is which: a pack ready for checkPack, its cards' sounds beside
 * it ({ card id: [file names] }), and what each game gets. A card whose sides swap keeps its id, so evidence stays.
 */
export function packOf(deck, { language, from, swap = false, separator = " ", languageDef = null }) {
  const items = [];
  const sounds = {};
  for (const card of deck.cards) {
    const { sounds: named, ...kept } = card;
    const flipped = swap && !card.cloze ? { ...kept, front: card.back, back: card.front } : kept;
    // A reading says how the language's side is said, so it stays only on a card whose front is still that side.
    if (swap && !card.cloze) delete flipped.reading;
    const { front, back, ...rest } = flipped;
    items.push(orderedItem({ ...rest, text: front, means: back }));
    if (named?.length) sounds[card.id] = named;
  }
  const pack = {
    format: "lexicommons-pack",
    version: 2,
    id: packIdOf(deck.name),
    name: deck.name,
    ...(deck.description ? { about: deck.description } : {}),
    language,
    // A language Lexicommons doesn't list: how it's written, as the person said on the import's page (anki/own-language.js).
    ...(languageDef ? { languageDef } : {}),
    from,
    topics: {},
    words: {},
    chunks: {},
    patterns: {},
    items,
  };
  return { pack, sounds };
}

/** How many cards get each game, for telling the person plainly what they got. sounded: card ids whose sound came through; says: whether a card's text is the side to say aloud (study/deck.js saidAloud). */
export function gamesReport(cards, { sounded = new Set(), separator = " ", says = () => false } = {}) {
  const others = itemOthers(cards);
  const counts = { card: 0, type: 0, match: 0, choose: 0, fill: 0, listen: 0, arrange: 0, say: 0 };
  for (const card of cards) for (const game of gamesOf(card, { others: others(card), sound: sounded.has(card.id), separator, says: says(card) })) counts[game]++;
  return counts;
}

/** Everything left out of a deck, as lines to say. */
export function leftOutLines(deck) {
  const { tally, leftOver } = deck;
  const lines = [];
  const say = (n, one, many) => n && lines.push(`${n.toLocaleString()} ${n === 1 ? one : many}`);
  if (leftOver) lines.push(`This deck is bigger than a pack holds, so you got its first ${deck.cards.length.toLocaleString()} cards. ${leftOver.toLocaleString()} more were left out.`);
  if (deck.soundsOther) lines.push(`${deck.soundsOther.toLocaleString()} ${deck.soundsOther === 1 ? "card's sound is" : "cards' sounds are"} in a format that can't be kept here, so ${deck.soundsOther === 1 ? "it comes" : "they come"} without.`);
  say(tally.pictureOnly, "card needs its picture to make sense, so it was left out.", "cards need their pictures to make sense, so they were left out.");
  say(tally.occlusion, "picture-covering card was left out.", "picture-covering cards were left out.");
  say(tally.math, "card written as math was left out.", "cards written as math were left out.");
  say(tally.extrasLeft, "other field was too long to keep.", "other fields were too long to keep.");
  say(tally.tooLong, "card was too long to fit.", "cards were too long to fit.");
  say(tally.noBack + tally.noFront, "note had nothing on one side.", "notes had nothing on one side.");
  say(tally.duplicate, "card was the same as another.", "cards were the same as others.");
  say(tally.nestedCloze, "card with a gap inside a gap was left out.", "cards with a gap inside a gap were left out.");
  say(tally.unknownType, "note didn't say what kind it was.", "notes didn't say what kind they were.");
  return lines;
}

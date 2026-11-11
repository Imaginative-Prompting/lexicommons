// An Anki file's collection and media list, as data. Its database comes as three generations: collection.anki2 and
// .anki21 (note types and decks as JSON in `col`), and the zstd-packed .anki21b (their own tables, with protobuf configs;
// next to it, collection.anki2 is a stub asking you to update Anki). SQLite is sql.js (MIT, public/vendor/anki/), in WebAssembly in a
// worker. This reads named tables and nothing else: a view or a trigger in a crafted file is refused or never
// reached, and templates are read for which fields they name, never rendered.

import { CAPS, DeckError, isZstd, readEntry, unzstd } from "./zip.js";

const decoder = new TextDecoder();
const broken = () => new DeckError("broken", "This file is damaged, so it can't be read.");

// ---------- protobuf: only the shapes Anki's files use ----------

/** A message's fields: Map(number → [value]), a value a number (varint) or bytes (length-delimited). */
export function protoFields(bytes) {
  const out = new Map();
  let p = 0;
  const varint = () => {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      if (p >= bytes.length) throw broken();
      const b = bytes[p++];
      value += (b & 0x7f) * scale;
      if (b < 0x80) return value;
      scale *= 128;
    }
    throw broken();
  };
  while (p < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key % 8;
    let value;
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const length = varint();
      if (length > bytes.length - p) throw broken();
      value = bytes.subarray(p, p + length);
      p += length;
    } else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else throw broken();
    if (value !== undefined) {
      if (!out.has(field)) out.set(field, []);
      out.get(field).push(value);
    }
  }
  return out;
}

const protoText = (fields, number) => {
  const value = fields.get(number)?.[0];
  return value instanceof Uint8Array ? decoder.decode(value) : "";
};

// ---------- which database, and the media list ----------

/** The file's collection database, unpacked: the newest generation in it. */
export async function collectionBytes(blob, entries, spending) {
  const entry = entries.get("collection.anki21b") ?? entries.get("collection.anki21") ?? entries.get("collection.anki2");
  if (!entry) throw new DeckError("not-anki", "That doesn't look like an Anki file. Anki decks end in .apkg, and whole collections in .colpkg.");
  const raw = await readEntry(blob, entry, { max: CAPS.collectionBytes, spending });
  return isZstd(raw) ? unzstd(raw, { max: CAPS.collectionBytes, spending }) : raw;
}

/**
 * Sounds and pictures in the file: Map(name as cards name it → the zip entry's name). An old file's list is JSON
 * ({ "0": "hond.mp3" }); a new one's is zstd-packed protobuf, entries in order, each one's zip name its position.
 */
export async function mediaMap(blob, entries, spending) {
  const entry = entries.get("media");
  const out = new Map();
  if (!entry) return out;
  let raw = await readEntry(blob, entry, { max: CAPS.mediaMapBytes, spending });
  const wasPacked = isZstd(raw);
  if (wasPacked) raw = unzstd(raw, { max: CAPS.mediaMapBytes, spending });
  if (!wasPacked) {
    let json;
    try {
      json = JSON.parse(decoder.decode(raw));
    } catch {
      return out;
    }
    if (json && typeof json === "object" && !Array.isArray(json)) for (const [zipName, name] of Object.entries(json)) if (typeof name === "string") out.set(name.normalize("NFC"), zipName);
    return out;
  }
  const list = protoFields(raw).get(1) ?? [];
  list.forEach((message, index) => {
    if (!(message instanceof Uint8Array)) return;
    const fields = protoFields(message);
    const name = protoText(fields, 1);
    const legacy = fields.get(255)?.[0];
    if (name) out.set(name.normalize("NFC"), String(typeof legacy === "number" ? legacy : index));
  });
  return out;
}

// ---------- the database ----------

/**
 * Anki's newest tables sort some text with its own collation, unicase, which SQLite can't find here, so it refuses
 * to read those tables at all. The word's swapped in the file's bytes for one that exists and is as long: nothing here reads
 * by those columns' order, and the file itself is never written back.
 */
export function allowUnicase(bytes) {
  const needle = [0x75, 0x6e, 0x69, 0x63, 0x61, 0x73, 0x65]; // unicase
  const swap = [0x6e, 0x6f, 0x63, 0x61, 0x73, 0x65, 0x20]; // "nocase "
  const before = [0x63, 0x6f, 0x6c, 0x6c, 0x61, 0x74, 0x65, 0x20]; // "collate ", so a note that says "unicase" stays as it is
  for (let i = bytes.indexOf(0x75); i >= 0 && i + 7 <= bytes.length; i = bytes.indexOf(0x75, i + 1)) {
    let same = i >= before.length;
    for (let k = 1; k < 7 && same; k++) same = bytes[i + k] === needle[k];
    for (let k = 0; k < before.length && same; k++) same = (bytes[i - before.length + k] | 0x20) === (before[k] | 0x20);
    if (same) for (let k = 0; k < 7; k++) bytes[i + k] = swap[k];
  }
  return bytes;
}

function rowsOf(db, sql, params = []) {
  const statement = db.prepare(sql);
  const out = [];
  try {
    statement.bind(params);
    while (statement.step()) out.push(statement.get());
  } finally {
    statement.free();
  }
  return out;
}

const NEEDED = ["notes", "cards"];

function tablesOf(db) {
  const kinds = new Map();
  for (const [name, type] of rowsOf(db, "select name, type from sqlite_master where type in ('table','view')")) kinds.set(String(name), String(type));
  for (const name of NEEDED) if (kinds.get(name) !== "table") throw new DeckError("not-anki", "That doesn't look like an Anki file: it has no cards in it.");
  return kinds;
}

const parseJson = (text) => {
  if (typeof text !== "string" || text.length > CAPS.jsonBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

function oldNoteTypes(db) {
  const row = rowsOf(db, "select models, decks from col limit 1")[0];
  if (!row) throw broken();
  const models = parseJson(row[0]);
  const decks = parseJson(row[1]);
  const types = new Map();
  if (models && typeof models === "object") {
    for (const [id, model] of Object.entries(models)) {
      if (!model || typeof model !== "object" || !Array.isArray(model.flds) || !Array.isArray(model.tmpls)) continue;
      types.set(String(model.id ?? id), {
        name: String(model.name ?? ""),
        cloze: model.type === 1,
        fields: model.flds.map((field) => String(field?.name ?? "")),
        templates: model.tmpls.map((template) => ({ q: String(template?.qfmt ?? ""), a: String(template?.afmt ?? "") })),
      });
    }
  }
  const deckMap = new Map();
  if (decks && typeof decks === "object") for (const [id, deck] of Object.entries(decks)) deckMap.set(String(deck?.id ?? id), { name: String(deck?.name ?? "").split("::")[0], description: String(deck?.desc ?? "") });
  return { types, decks: deckMap };
}

function newNoteTypes(db, kinds) {
  for (const name of ["notetypes", "fields", "templates", "decks"]) if (kinds.get(name) !== "table") throw broken();
  const types = new Map();
  for (const [id, name, config] of rowsOf(db, "select id, name, config from notetypes")) {
    const fields = config instanceof Uint8Array ? protoFields(config) : new Map();
    types.set(String(id), { name: String(name), cloze: fields.get(1)?.[0] === 1, fields: [], templates: [] });
  }
  for (const [ntid, name] of rowsOf(db, "select ntid, name from fields order by ntid, ord")) types.get(String(ntid))?.fields.push(String(name));
  for (const [ntid, config] of rowsOf(db, "select ntid, config from templates order by ntid, ord")) {
    const fields = config instanceof Uint8Array ? protoFields(config) : new Map();
    types.get(String(ntid))?.templates.push({ q: protoText(fields, 1), a: protoText(fields, 2) });
  }
  const decks = new Map();
  for (const [id, name, kind] of rowsOf(db, "select id, name, kind from decks")) {
    let description = "";
    if (kind instanceof Uint8Array) {
      const normal = protoFields(kind).get(1)?.[0];
      if (normal instanceof Uint8Array) description = protoText(protoFields(normal), 4);
    }
    decks.set(String(id), { name: String(name).split("\x1f")[0], description });
  }
  return { types, decks };
}

/**
 * The collection, read: { types, deckName, description, total, notes(keep) }.
 *   types   Map(id → { name, cloze, fields, templates: [{ q, a }] })
 *   total   how many notes it has
 *   notes   a generator of { id, type, fields: [text] } in the deck's own order
 */
export function readCollection(db) {
  // Nothing here should need more than reading, and a crafted schema gets no favors.
  db.run("pragma query_only = 1");
  db.run("pragma trusted_schema = 0");
  const kinds = tablesOf(db);
  const { types, decks } = kinds.has("notetypes") && rowsOf(db, "select count(*) from notetypes")[0]?.[0] > 0 ? newNoteTypes(db, kinds) : oldNoteTypes(db);
  const total = Number(rowsOf(db, "select count(*) from notes")[0]?.[0] ?? 0);
  if (total > CAPS.notes) throw new DeckError("too-big", `This deck has ${total.toLocaleString()} notes, more than Lexicommons can go through on a device, so it wasn't added.`);
  // The deck most of its cards are in names it (a deck's own name, its first part when it has sub-decks).
  const inDeck = new Map();
  for (const [did, count] of rowsOf(db, "select did, count(*) from cards group by did")) {
    const name = decks.get(String(did))?.name;
    if (name !== undefined) inDeck.set(name, { count: (inDeck.get(name)?.count ?? 0) + Number(count), deck: decks.get(String(did)) });
  }
  const main = [...inDeck.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const description = [...decks.values()].find((deck) => deck.name === main?.[0] && deck.description)?.description ?? "";
  // A deck's order: new cards by their position, the rest after them. A note's place is its first card's.
  const order = rowsOf(db, "select nid from cards order by case when type = 0 then 0 else 1 end, due, id, ord");
  const seen = new Set();
  const noteIds = [];
  for (const [nid] of order) {
    if (seen.has(nid)) continue;
    seen.add(nid);
    noteIds.push(nid);
  }
  function* notes() {
    const statement = db.prepare("select id, mid, flds, tags from notes where id = ?");
    try {
      for (const nid of noteIds) {
        statement.bind([nid]);
        if (statement.step()) {
          const [id, mid, flds, tags] = statement.get();
          yield { id: String(id), type: String(mid), raw: typeof flds === "string" ? flds : "", tags: typeof tags === "string" ? tags : "" };
        }
        statement.reset();
      }
    } finally {
      statement.free();
    }
  }
  return { types, deckName: main?.[0] ?? "", description, total, cards: noteIds.length, notes };
}

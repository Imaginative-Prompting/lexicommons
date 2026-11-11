// Anki files for the checks, written here and never downloaded, so nothing third-party is in the repo: each generation of the
// format (collection.anki2, .anki21, zstd .anki21b with its protobuf configs and media list, .colpkg), and the hostile ones.
// Real decks are run through the same checks from a folder on the side (test-anki.mjs --decks, anki-check.mjs --deck).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, zstdCompressSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, "../../public/vendor/anki");

/** sql.js in Node, from the vendored files. */
export async function sqlJs() {
  const source = readFileSync(join(VENDOR, "sql-wasm.js"), "utf8");
  const initSqlJs = new Function("module", "exports", "define", `${source}\nreturn initSqlJs;`)();
  return initSqlJs({ wasmBinary: readFileSync(join(VENDOR, "sql-wasm.wasm")) });
}

// ---------- zip ----------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A zip of [{ name, bytes, store?, claim? }]; claim: a size its directory says, whatever the truth (a zip that lies). */
export function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const raw = Buffer.from(file.bytes);
    const packed = file.store ? raw : deflateRawSync(raw);
    const name = Buffer.from(file.name);
    const crc = raw.length < 5_000_000 ? crc32(raw) : 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(file.store ? 0 : 8, 8);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(file.claim ?? raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    locals.push(head, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(file.store ? 0 : 8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(file.claim ?? raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

// ---------- protobuf ----------

const varint = (n) => {
  const out = [];
  let v = n;
  while (v >= 128) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return Buffer.from(out);
};
const pbBytes = (field, bytes) => Buffer.concat([varint(field * 8 + 2), varint(bytes.length), Buffer.from(bytes)]);
const pbText = (field, text) => pbBytes(field, Buffer.from(text));
const pbInt = (field, value) => Buffer.concat([varint(field * 8), varint(value)]);

// ---------- the deck itself ----------

export const BASIC = { id: 1001, name: "Basic", fields: ["Front", "Back"], templates: [{ q: "{{Front}}", a: "{{FrontSide}}<hr id=answer>{{Back}}" }] };
export const CLOZE = { id: 1002, name: "Cloze", cloze: true, fields: ["Text", "Extra"], templates: [{ q: "{{cloze:Text}}", a: "{{cloze:Text}}<br>{{Extra}}" }] };

/** A spec's notes as rows: each note { fields: [text], type?, tags? }, in order. */
const rows = (spec) => spec.notes.map((note, i) => ({ id: 1_700_000_000_000 + i, mid: note.type ?? spec.types[0].id, flds: note.fields.join("\x1f"), ord: i, tags: note.tags ? ` ${note.tags} ` : "" }));

function fillCards(db, spec) {
  const did = spec.deckId ?? 2001;
  db.run("create table notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)");
  db.run("create table cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)");
  db.run("begin");
  const note = db.prepare("insert into notes values (?,?,?,0,0,?,?,'',0,0,'')");
  const card = db.prepare("insert into cards values (?,?,?,0,0,0,0,0,?,0,0,0,0,0,0,0,0,'')");
  for (const row of rows(spec)) {
    note.run([row.id, `g${row.id}`, row.mid, row.tags, row.flds]);
    card.run([row.id, row.id, did, row.ord]);
  }
  note.free();
  card.free();
  db.run("commit");
}

/** collection.anki2 or .anki21's database: note types and decks as JSON in col. */
export function oldCollection(SQL, spec) {
  const db = new SQL.Database();
  db.run("create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)");
  const models = Object.fromEntries(spec.types.map((type) => [type.id, { id: type.id, name: type.name, type: type.cloze ? 1 : 0, flds: type.fields.map((name, ord) => ({ name, ord })), tmpls: type.templates.map((t, ord) => ({ name: `Card ${ord + 1}`, ord, qfmt: t.q, afmt: t.a })) }]));
  const decks = { 1: { id: 1, name: "Default", desc: "" }, [spec.deckId ?? 2001]: { id: spec.deckId ?? 2001, name: spec.deck ?? "Test deck", desc: spec.description ?? "" } };
  db.run("insert into col values (1,0,0,0,11,0,0,0,'{}',?,?,'{}','{}')", [JSON.stringify(models), JSON.stringify(decks)]);
  fillCards(db, spec);
  const bytes = db.export();
  db.close();
  return Buffer.from(bytes);
}

/** collection.anki21b's database, with its own tables and protobuf configs, its text sorted by unicase as Anki's is. */
export function newCollection(SQL, spec) {
  const db = new SQL.Database();
  // Written with a collation sql.js has, then given Anki's own name for it, which no reader here can find.
  db.run("create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf blob, models text, decks text, dconf text, tags text)");
  db.run("insert into col values (1,0,0,0,18,0,0,0,'','{}','{}','{}','{}')");
  db.run("create table notetypes (id integer not null primary key, name text not null COLLATE nocase , mtime_secs integer not null, usn integer not null, config blob not null)");
  db.run("create unique index idx_notetypes_name on notetypes (name)");
  db.run("create table fields (ntid integer not null, ord integer not null, name text not null COLLATE nocase , config blob not null, primary key (ntid, ord)) without rowid");
  db.run("create unique index idx_fields_name_ntid on fields (name, ntid)");
  db.run("create table templates (ntid integer not null, ord integer not null, name text not null COLLATE nocase , mtime_secs integer not null, usn integer not null, config blob not null, primary key (ntid, ord)) without rowid");
  db.run("create table decks (id integer primary key not null, name text not null COLLATE nocase , mtime_secs integer not null, usn integer not null, common blob not null, kind blob not null)");
  for (const type of spec.types) {
    db.run("insert into notetypes values (?,?,0,0,?)", [type.id, type.name, Uint8Array.from(Buffer.concat([pbInt(1, type.cloze ? 1 : 0)]))]);
    type.fields.forEach((name, ord) => db.run("insert into fields values (?,?,?,?)", [type.id, ord, name, new Uint8Array()]));
    type.templates.forEach((t, ord) => db.run("insert into templates values (?,?,?,0,0,?)", [type.id, ord, `Card ${ord + 1}`, Uint8Array.from(Buffer.concat([pbText(1, t.q), pbText(2, t.a)]))]));
  }
  const kind = (description) => Uint8Array.from(pbBytes(1, Buffer.concat([pbInt(1, 1), pbText(4, description)])));
  db.run("insert into decks values (1,'Default',0,0,?,?)", [new Uint8Array(), kind("")]);
  db.run("insert into decks values (?,?,0,0,?,?)", [spec.deckId ?? 2001, spec.deck ?? "Test deck", new Uint8Array(), kind(spec.description ?? "")]);
  fillCards(db, spec);
  const bytes = Buffer.from(db.export());
  db.close();
  return Buffer.from(bytes.toString("latin1").replaceAll("COLLATE nocase ", "COLLATE unicase"), "latin1");
}

const mediaProto = (names) => zstdCompressSync(Buffer.concat(names.map(([name, bytes]) => pbBytes(1, Buffer.concat([pbText(1, name), pbInt(2, bytes.length)])))));

/** An old file: collection.anki2 (or anki21), its media listed as JSON, each file under its number. */
export function oldApkg(SQL, spec, { name = "collection.anki2" } = {}) {
  const media = Object.entries(spec.media ?? {});
  return zip([{ name, bytes: oldCollection(SQL, spec) }, { name: "media", bytes: Buffer.from(JSON.stringify(Object.fromEntries(media.map(([file], i) => [String(i), file])))) }, ...media.map(([, bytes], i) => ({ name: String(i), bytes }))]);
}

/** A new file: the real collection zstd-packed, the old name only a stub, its media list and files zstd-packed too. */
export function newApkg(SQL, spec) {
  const media = Object.entries(spec.media ?? {});
  const stub = oldCollection(SQL, { ...spec, notes: [{ fields: ["Please update to the latest Anki version", "then import this file again."] }], types: [BASIC], deck: "Default" });
  return zip([
    { name: "collection.anki2", bytes: stub },
    { name: "collection.anki21b", bytes: zstdCompressSync(newCollection(SQL, spec)), store: true },
    { name: "media", bytes: mediaProto(media), store: true },
    { name: "meta", bytes: pbInt(1, 3), store: true },
    ...media.map(([, bytes], i) => ({ name: String(i), bytes: zstdCompressSync(bytes), store: true })),
  ]);
}

/** A .colpkg has the same inside as a new .apkg. */
export const newColpkg = newApkg;

// ---------- hostile ----------

/** A zip whose one entry unpacks far past every cap, while its directory says it's small. */
export const deflateBomb = (megabytes = 260) => zip([{ name: "collection.anki2", bytes: Buffer.alloc(megabytes * 1_000_000), claim: 4096 }]);
export const zstdBomb = (megabytes = 260) => zip([{ name: "collection.anki21b", bytes: zstdCompressSync(Buffer.alloc(megabytes * 1_000_000)), store: true }]);

/** A zstd frame that asks to keep 2 GB in memory before it says anything else. */
export function zstdHugeWindow() {
  const descriptor = (31 - 10) << 3; // 2^31 bytes
  const frame = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, descriptor, 0x01, 0x00, 0x00]);
  return zip([{ name: "collection.anki21b", bytes: frame, store: true }]);
}

/** Bytes that aren't a database at all, under a database's name. */
export const brokenDatabase = () => zip([{ name: "collection.anki2", bytes: Buffer.from("this is not a database ".repeat(400)) }]);

/** A real database cut off partway. */
export const truncatedDatabase = (SQL, spec) => {
  const bytes = oldCollection(SQL, spec);
  return zip([{ name: "collection.anki2", bytes: bytes.subarray(0, Math.floor(bytes.length / 2)) }]);
};

/** A database whose notes are a view that never ends, and one whose notes hold a trigger. */
export function viewDatabase(SQL) {
  const db = new SQL.Database();
  db.run("create table col (id integer primary key, models text, decks text)");
  db.run("insert into col values (1,'{}','{}')");
  db.run("create table cards (id integer primary key, nid integer, did integer, ord integer, type integer, due integer)");
  db.run("create view notes as with recursive n(id) as (select 1 union all select id + 1 from n) select id, id as mid, 'a' as flds from n");
  const bytes = Buffer.from(db.export());
  db.close();
  return zip([{ name: "collection.anki2", bytes }]);
}

/** A deck with `count` notes, quickly, by SQL. */
export function manyNotes(SQL, count) {
  const db = new SQL.Database();
  db.run("create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)");
  const models = { [BASIC.id]: { id: BASIC.id, name: BASIC.name, type: 0, flds: BASIC.fields.map((name, ord) => ({ name, ord })), tmpls: BASIC.templates.map((t, ord) => ({ name: "Card 1", ord, qfmt: t.q, afmt: t.a })) } };
  db.run("insert into col values (1,0,0,0,11,0,0,0,'{}',?,?,'{}','{}')", [JSON.stringify(models), JSON.stringify({ 2001: { id: 2001, name: "Huge deck", desc: "" } })]);
  db.run("create table notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)");
  db.run("create table cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)");
  db.run(`with recursive n(i) as (select 1 union all select i + 1 from n where i < ${count})
    insert into notes select 1700000000000 + i, 'g' || i, ${BASIC.id}, 0, 0, '', 'woord' || i || char(31) || 'word' || i, '', 0, 0, '' from n`);
  db.run("insert into cards select id, id, 2001, 0, 0, 0, 0, 0, id - 1700000000000, 0, 0, 0, 0, 0, 0, 0, 0, '' from notes");
  const bytes = Buffer.from(db.export());
  db.close();
  return zip([{ name: "collection.anki2", bytes }]);
}

/** A deck full of what must never run: script in fields, in a template, in a note type's own markup, in cloze and in a name. */
export const HOSTILE = {
  deck: "Dutch <img src=x onerror=alert(1)>",
  description: "<script>alert('description')</script>Made by someone",
  types: [
    { id: 1001, name: "Basic", fields: ["Front", "Back"], templates: [{ q: "<script>window.__ran = 'template'</script>{{Front}}<img src=x onerror=\"window.__ran='q'\">", a: "<script>window.__ran = 'answer'</script>{{FrontSide}}{{Back}}" }] },
    CLOZE,
  ],
  notes: [
    { fields: ["<script>window.__ran='front'</script>het huis", "<img src=x onerror=\"window.__ran='back'\">the house"] },
    { fields: ["de &lt;img src=x onerror=window.__ran='entity'&gt; hond", "the dog"] },
    { fields: ["<svg onload=\"window.__ran='svg'\"><script>window.__ran='svg2'</script></svg>de kat", "<iframe src=javascript:window.__ran='iframe'></iframe>the cat"] },
    { fields: ["<a href=\"javascript:window.__ran='link'\">de boom</a>", "<style>*{display:none}</style>the tree"] },
    { type: 1002, fields: ["Het {{c1::<b onclick=\"window.__ran='cloze'\">water</b>}} is koud.", "<script>window.__ran='extra'</script>The water is cold."] },
    { fields: ["de <<<< stoel", "the chair >>>>"] },
    { fields: ["de tafel", "<div onmouseover=\"window.__ran='hover'\">the table"] },
  ],
};

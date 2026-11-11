// A small, real EPUB 3 for the checks (test-texts.mjs, text-check.mjs): a zip whose first entry is the stored
// "mimetype", then the container, the package and one XHTML file per chapter, every entry stored (no compression).
// makeEpub({ title, lang, chapters: [{ title, paragraphs: [text] }], spine? }) → Uint8Array (spine: the chapters'
// indexes in reading order, each once by default). zip({ name: bytes }, { store })
// writes any zip (store: the entries' compression method, 0 stored; tests use 8 to make a mimetype that isn't stored).

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const utf8 = (text) => new TextEncoder().encode(text);

/** A zip of the entries in the order given ({ name: Uint8Array | string }), each with the method given (stored: 0). */
export function zip(entries, { method = 0 } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = typeof content === "string" ? utf8(content) : content;
    const nameBytes = utf8(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A real EPUB 3 with the chapters given. */
export function makeEpub({ title, lang = "nl", chapters, spine = chapters.map((_, i) => i) }) {
  const ids = chapters.map((_, i) => `c${i + 1}`);
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:00000000-0000-4000-8000-000000000001</dc:identifier>
    <dc:title>${escape(title)}</dc:title>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">2026-10-27T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${ids.map((id) => `    <item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join("\n")}
  </manifest>
  <spine>
${spine.map((i) => `    <itemref idref="${ids[i]}"/>`).join("\n")}
  </spine>
</package>`;
  const page = (heading, body) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><title>${escape(heading)}</title></head>
<body>${body}</body>
</html>`;
  const nav = page(title, `<nav epub:type="toc"><ol>${chapters.map((c, i) => `<li><a href="${ids[i]}.xhtml">${escape(c.title)}</a></li>`).join("")}</ol></nav>`);
  const entries = {
    mimetype: "application/epub+zip",
    "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    "OEBPS/content.opf": opf,
    "OEBPS/nav.xhtml": nav,
  };
  chapters.forEach((c, i) => {
    entries[`OEBPS/${ids[i]}.xhtml`] = page(c.title, `<section epub:type="chapter"><h1>${escape(c.title)}</h1>${c.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("")}</section>`);
  });
  return zip(entries);
}

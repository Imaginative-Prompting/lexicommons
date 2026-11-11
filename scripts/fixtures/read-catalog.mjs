// A catalog at scale for read-scale-check.mjs: the real catalog's books, then made-up ones up to `count`, every kind of
// book Read knows (picture books, non-fiction, books in Dutch with help, books woven into Dutch, books in other languages) at every
// level. Made-up books have no cover and no drawing, so each shows its title cover; their files don't exist, so a check
// never opens one. Deterministic: the same count gives the same catalog.

const SUBJECTS = [
  "De fietsenmaker", "Een kamer", "Het lied", "De schipper", "De molen", "Het huis", "De laatste trein", "De brief", "De brug", "Het eiland",
  "De markt", "De haven", "Oma", "Sam", "De kat", "De hond", "Het meisje", "De jongen", "De bakker", "De buurman",
  "Het bos", "De sleutel", "De zee", "De storm", "Het perron", "De veerman", "De tuin", "Het dorp", "De klok", "De boot",
];
const ENDINGS = [
  "in Delft", "aan zee", "bij nacht", "in de winter", "op zaterdag", "in de regen", "in Groningen", "aan de gracht", "in de zomer", "na de storm",
  "op de camping", "in Amsterdam", "bij oma", "in het bos", "op de markt", "in de stad", "op het eiland", "voor de deur", "onder de brug", "in de trein",
  "op het dak", "achter het huis", "in Utrecht", "bij de haven", "in de tuin", "om tien uur", "in het donker", "op reis", "in de sneeuw", "aan het water",
  "van vroeger", "zonder adres", "met de hoed",
];
// Children's non-fiction in Dutch (kind "nonfiction", as Wikijunior's say it), half of them with pictures: none is a picture book.
const NONFICTION = ["Het menselijk lichaam", "Dieren in de zee", "Het zonnestelsel", "Vulkanen", "Bomen", "Vogels", "Het weer", "Dinosaurussen", "Water", "Insecten"];
// Titles a search must find past their accents ("cafe" finds these).
const ACCENTED = ["Het café om de hoek", "Een idee voor België", "De reünie", "Café de Zon", "Één dag in Brussel"];
const CLASSICS = [
  ["The Wind in the Willows", "Kenneth Grahame"], ["Peter Pan", "J. M. Barrie"], ["Treasure Island", "Robert Louis Stevenson"], ["Heidi", "Johanna Spyri"],
  ["The Adventures of Pinocchio", "Carlo Collodi"], ["The Secret Garden", "Frances Hodgson Burnett"], ["Black Beauty", "Anna Sewell"],
  ["Anne of Green Gables", "L. M. Montgomery"], ["The Jungle Book", "Rudyard Kipling"], ["Little Women", "Louisa May Alcott"], ["A Christmas Carol", "Charles Dickens"],
  ["The Wonderful Wizard of Oz", "L. Frank Baum"], ["The Adventures of Sherlock Holmes", "Arthur Conan Doyle"], ["Robinson Crusoe", "Daniel Defoe"],
  ["Through the Looking-Glass", "Lewis Carroll"], ["The Hunting of the Snark", "Lewis Carroll"], ["The Railway Children", "E. Nesbit"], ["The Time Machine", "H. G. Wells"],
];
const PARTS = ["", ": the opening", ", chapter 2", ", chapter 3", ", chapter 4"];
const ELSEWHERE = [
  ["de", "Der kleine Garten"], ["de", "Ein Tag am Meer"], ["de", "Die alte Mühle"], ["de", "Der Brief"], ["de", "Im Winter"], ["fr", "Le petit jardin"],
  ["fr", "Une journée à la mer"], ["fr", "Le vieux moulin"], ["fr", "La lettre"], ["fr", "En hiver"], ["es", "El jardín pequeño"], ["es", "Un día en el mar"],
  // Right to left, for the layout: titles in their own direction among left-to-right ones.
  ["ar", "الحديقة الصغيرة"], ["ar", "يوم على البحر"], ["he", "הגן הקטן"], ["he", "יום בים"],
];

const hex = (n) => (n * 2654435761 >>> 0).toString(16).padStart(8, "0").repeat(2);

/** The made-up books, in a fixed order: [{ id, title, lang, level?, pictures?, layers, authors, words }]. */
function madeUp() {
  const out = [];
  let n = 0;
  const book = (fields) => out.push({ id: `scale-${String(++n).padStart(4, "0")}`, version: hex(n), authors: [], rights: { us: true, eu: true }, ...fields });
  for (const [title, by] of CLASSICS.flatMap(([title, by]) => PARTS.map((part) => [`${title}${part}`, by])))
    book({ title, lang: "en", authors: [{ name: by, role: "author" }], words: 600 + ((n * 977) % 9000), layers: { nl: { kind: "weave" } } });
  for (const [lang, title] of ELSEWHERE) book({ title, lang, level: 1 + (n % 3), words: 150 + ((n * 131) % 600), layers: { en: { kind: "help" } } });
  for (const title of ACCENTED) book({ title, lang: "nl", level: 1 + (n % 5), words: 300 + ((n * 211) % 2000), layers: { en: { kind: "help" } } });
  NONFICTION.forEach((title, i) => book({ title, lang: "nl", kind: "nonfiction", level: 1 + (i % 3), words: 400 + ((n * 173) % 1500), ...(i % 2 ? {} : { pictures: 6 + (i % 5) }), layers: { en: { kind: "help" } } }));
  SUBJECTS.forEach((subject, i) =>
    ENDINGS.forEach((ending, j) => {
      const picture = (i + j) % 3 === 0;
      book({
        title: `${subject} ${ending}`,
        lang: "nl",
        level: 1 + ((i * 7 + j * 3) % (picture ? 3 : 5)),
        words: picture ? 120 + ((i * 31 + j * 17) % 480) : 800 + ((i * 313 + j * 97) % 6000),
        ...(picture ? { pictures: 8 + ((i + j) % 7) } : {}),
        layers: { en: { kind: "help" } },
      });
    }),
  );
  return out;
}

/** The real catalog with made-up books after its own, `count` books in all (never fewer than the real ones). */
export function scaledCatalog(real, count) {
  const books = [...(real.books ?? [])];
  for (const meta of madeUp()) {
    if (books.length >= count) break;
    books.push({ ...meta, book: `/library/books/${meta.id}/${meta.version}/book.json`, publishedAt: "2026-11-01T00:00:00.000Z" });
  }
  if (books.length < count) throw new Error(`read-catalog: only ${books.length} books can be made, not ${count}`);
  return { ...real, books: books.sort((a, b) => (a.title < b.title ? -1 : 1)) };
}

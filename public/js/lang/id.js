// Indonesian (lang/index.js has what each field means). Dictionary forms are root words, as Indonesian dictionaries
// list them (membaca under baca).

export default {
  name: "Indonesian",
  locale: "id-ID",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["bpk.", "sdr.", "dr.", "prof.", "jl.", "no.", "hlm.", "dll.", "dsb.", "tsb.", "yth.", "a.n.", "s.d."],
  stray: ["tidak", "yang", "ini", "itu", "di", "akan"],
  patterns: {
    "no-copula": { name: "Descriptions and identities without is", about: "Before a describing word or an ordinary noun, Indonesian normally needs no is: Saya lapar (I hungry), Itu mobil saya (that car my: that's my car).", after: [] },
    "adjective-after": { name: "Describing words after the noun", about: "A describing word, or a noun that describes, comes after the noun: rumah kecil (house small), kopi susu (coffee milk).", after: [] },
    possessive: { name: "Whose: after the noun", about: "The owner comes after the thing, and saya (I, me) also means my: rumah saya (house my), mobil ayah saya (car father my: my father's car).", after: ["adjective-after"] },
    "ini-itu": { name: "ini, itu: this, that", about: "When ini (this) and itu (that) point out a noun, they follow it: buku ini (book this), hari ini (day this: today); on their own, they can come first: Itu mobil saya (that car my).", after: ["adjective-after"] },
    "tidak-bukan": { name: "tidak and bukan: not", about: "For a plain not, use tidak before a verb or a describing word (Saya tidak tahu: I not know) and bukan before a noun (Ibu saya bukan guru: mother my not teacher); bukan can also reject a whole idea.", after: [] },
    aspect: { name: "Time words, not tenses", about: "A verb doesn't change for past or future; words like sudah (already), sedang (in the middle of), akan (will) and kemarin (yesterday) say when: Saya sudah makan (I already eat: I've eaten).", after: [] },
    question: { name: "Questions", about: "A yes-or-no question can keep the order of a statement, and a question word often sits where its answer would go: Kamu haus? (you thirsty?), Kamu tinggal di mana? (you live at where?).", after: [] },
    ada: { name: "ada: there is", about: "ada says there is or there are, and tidak ada there isn't: Ada roti (exist bread), Tidak ada roti (not exist bread).", after: [] },
    "di-ke-dari": { name: "di, ke, dari: at, to, from", about: "di is at or in, ke is to and dari is from: di rumah (at home), ke pasar (to market), dari kantor (from office).", after: [] },
    modal: { name: "mau, bisa, harus, boleh + verb", about: "To say want, can, must or may do something, normally put the next verb right after mau, bisa, harus or boleh: Saya mau makan (I want eat); untuk adds a purpose, not English to.", after: [] },
    yang: { name: "yang: the one that", about: "yang (that, which) joins a describing word to a noun, or stands for the noun: hotel yang murah (hotel that cheap), yang besar (the big one).", after: ["adjective-after"] },
    reduplication: { name: "Doubling nouns for more than one", about: "Doubling a noun can show more than one when that matters, while after a number or banyak (many) the plain noun is enough: anak-anak (children), dua anak (two children), banyak toko (many shops).", after: [] },
    "kami-kita": { name: "kami and kita: two kinds of we", about: "kami is we without the person you're talking to, and kita is we with them: Kami tinggal di sini (we, not you, live here), Kita ketemu Sabtu? (we, you too, meet Saturday?).", after: [] },
    "men-verbs": { name: "Action verbs built from roots", about: "Many action verbs are built from a root by adding a beginning that changes with the root, and sometimes an ending: masak → memasak (to cook), kerja → mengerjakan (to do a task), kunjung → mengunjungi (to visit).", after: [] },
  },
};

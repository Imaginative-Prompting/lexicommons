// The full translator's files: Mozilla's translation models (the ones Firefox Translations uses, from its public
// list: firefox.settings.services.mozilla.com, collection translations-models; MPL-2.0) and bergamot, the runtime that
// runs them (MPL-2.0, public/vendor/bergamot/). Pure data. Each file is in the open library named by its own hash
// (/library/translate/<16 hex>.<bin|spm>, src/books.ts), checked against its sha256 on the device before it's kept, so
// a file is only ever the one listed here. A language has the full translator when both its ways with English are
// here; adding one is its files uploaded (scripts/translate/models-r2.mjs) and its entry below. A way Mozilla releases per platform
// (English to Russian) is its Android build, the phone-sized one.

export const CREDIT = "The full translator: Mozilla's translation models and bergamot (Firefox Translations), under the Mozilla Public License 2.0.";
export const CACHE = "lx-translator-v1";

const file = (name, sha256, size) => ({ name, sha256, size, url: `/library/translate/${sha256.slice(0, 16)}.${name.endsWith(".spm") ? "spm" : "bin"}` });

/** The runtime: its script is in the app (SHELL), its WebAssembly downloaded with a language's files and kept. */
export const RUNTIME = {
  script: "/vendor/bergamot/bergamot-translator.js",
  wasm: { name: "bergamot-translator.wasm", sha256: "a3a89d9ad0a4ed8f27bf3e403701b23f5709816f6376438503f2fa5b0182c2dc", size: 4960506, url: "/vendor/bergamot/bergamot-translator.wasm" },
};

/** Each way's files, by "<from>><to>": the model, its lexical shortlist and its vocabulary, at Mozilla's version. */
export const WAYS = {
  "nl>en": {
    version: "2.0",
    model: file("model.nlen.intgemm.alphas.bin", "ff987741ff15a5d94fff16cbef28f2b0a85a6e9547d982fad60ac09d16d11270", 31561787),
    lex: file("lex.50.50.nlen.s2t.bin", "811ac8f9dcbd12706e2d73a7057a7bbe6b9f0607d15170ffe9439977e8229b41", 4862412),
    vocab: file("vocab.nlen.spm", "c09588ca5662b230ed65bd39a07f58d9f7dd21c3a19e4aeb1bff39bf3b297c56", 807708),
  },
  "en>nl": {
    version: "2.1",
    model: file("model.ennl.intgemm.alphas.bin", "7e8402da61972dc2fdcf7147c7f1e12f7916a6d9349514ee7a731288357575a9", 31561787),
    lex: file("lex.50.50.ennl.s2t.bin", "bb4922718f8ca6d746ad090c0a88110a664dc050ee3f311bce33698b4e1679e9", 4030624),
    vocab: file("vocab.ennl.spm", "c09588ca5662b230ed65bd39a07f58d9f7dd21c3a19e4aeb1bff39bf3b297c56", 807708),
  },
  // The open shelf's other languages (8 Nov 2026), from Mozilla's list as it stood on 7 Nov: each way's newest version released to everyone.
  "es>en": {
    version: "2.0",
    model: file("model.esen.intgemm.alphas.bin", "4aed7734152ae0045d1a69ae49c86cfda18f53c61f90e95e1d1de1c7c7c3b033", 31561787),
    lex: file("lex.50.50.esen.s2t.bin", "e2610211d3b9577d012638fe7e7e74ed7b4b708ce96b9e792e67c282a6492daa", 4636248),
    vocab: file("vocab.esen.spm", "5ae254fa9b15aa182e70fd2a6186b1333c63a29a48043a9224c6aa4fcac058ad", 816054),
  },
  "en>es": {
    version: "2.1",
    model: file("model.enes.intgemm.alphas.bin", "3b1c399511c01c84c36fae5c0524df44096288efdc8236e182b5c97d7ad2244c", 31561787),
    lex: file("lex.50.50.enes.s2t.bin", "7d51237c0a07027dcd61643cfbbb0f8c48597d19907ef53d2cae9d6bec2cf25c", 4198436),
    vocab: file("vocab.enes.spm", "5ae254fa9b15aa182e70fd2a6186b1333c63a29a48043a9224c6aa4fcac058ad", 816054),
  },
  "fr>en": {
    version: "2.0",
    model: file("model.fren.intgemm.alphas.bin", "15f997bc0d13808b0b0fbd0786e684a3c8a52adcd8071844b76123fdacbf2b90", 31561787),
    lex: file("lex.50.50.fren.s2t.bin", "87c6752ea908f5f0347c10ac0cf7d80d9c2f4f20c81c90168f3e8230b56d4440", 4824120),
    vocab: file("vocab.fren.spm", "783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a", 814404),
  },
  "en>fr": {
    version: "2.0",
    model: file("model.enfr.intgemm.alphas.bin", "6322e296d4fecfe395a8d5723da4ec37ecbe6d7613bb1dfcf4b28e2a47498b68", 31561787),
    lex: file("lex.50.50.enfr.s2t.bin", "2585ed98d3af0bc949865aedeb390493d591f56870814376e73e4144c41ed059", 4372936),
    vocab: file("vocab.enfr.spm", "783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a", 814404),
  },
  "de>en": {
    version: "2.0",
    model: file("model.deen.intgemm.alphas.bin", "3e6f7c2c2425d10824797270b382bee718ff34af2cab9308841c82ca46dc6f20", 31561787),
    lex: file("lex.50.50.deen.s2t.bin", "113b98460468360cca68c042e1cddf49c4e1931cbb975ed04349c9a3bd607010", 4945796),
    vocab: file("vocab.deen.spm", "69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c", 810073),
  },
  "en>de": {
    version: "2.1",
    model: file("model.ende.intgemm.alphas.bin", "8df29d9494d19f47fd5d97c6a73474c6f657e9f81c1a607c431d02befdf3810f", 31561787),
    lex: file("lex.50.50.ende.s2t.bin", "7ed39f1cffbd68a27ddf05bbfe068de2060f1d7e69f1a20e27ae923551dd7393", 4347672),
    vocab: file("vocab.ende.spm", "69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c", 810073),
  },
  "pt>en": {
    version: "2.0",
    model: file("model.pten.intgemm.alphas.bin", "7b854f1ec5a485dd33efd7c1bc01dd7d5a57f566957c5e47722af333f0ce9157", 31561787),
    lex: file("lex.50.50.pten.s2t.bin", "2685d8b6530be92a4db4cc61f15a097eb114552be15cb6c1699e9d2d99d24470", 4634492),
    vocab: file("vocab.pten.spm", "d9f46182823d5bbc84201252b2dfcac28f63e561f0ec827ed858f241864c9def", 816726),
  },
  "en>pt": {
    version: "2.1",
    model: file("model.enpt.intgemm.alphas.bin", "07892fd2544ee79dcb643615d8f2debb9793fae16842e87c328e27a3dd26a770", 31561787),
    lex: file("lex.50.50.enpt.s2t.bin", "ccb4c31c9e1899d77a200e71a86958e6ef6c8649627d0bbf3f873b57d9f236bd", 3970340),
    vocab: file("vocab.enpt.spm", "d9f46182823d5bbc84201252b2dfcac28f63e561f0ec827ed858f241864c9def", 816726),
  },
  "it>en": {
    version: "2.0",
    model: file("model.iten.intgemm.alphas.bin", "21b70978ce2f3b4da7a06b5de86a09abe3acd30b9eee1b2ebb3582b9bad790bf", 31561787),
    lex: file("lex.50.50.iten.s2t.bin", "0700d6d70b30490e68ff9deca0b45b80310745b491855bde3a13e1692d0cbce1", 4713616),
    vocab: file("vocab.iten.spm", "3ef0211d4ae6db21440892f180f2019fe2bfc110a330ffa9d2eca9665e4f2bc5", 812724),
  },
  "en>it": {
    version: "2.1",
    model: file("model.enit.intgemm.alphas.bin", "248f47568788ecc351da7e5e07064d4153b4f71e011364ae2c931ffeec4d1cc2", 31561787),
    lex: file("lex.50.50.enit.s2t.bin", "8b21914804625b2777dae7fdb636eb78f02a3eb8b7bceaa50f29ac740961da93", 4133192),
    vocab: file("vocab.enit.spm", "3ef0211d4ae6db21440892f180f2019fe2bfc110a330ffa9d2eca9665e4f2bc5", 812724),
  },
  "tr>en": { // Mozilla's older tiny models: smaller, noticeably weaker
    version: "1.0",
    model: file("model.tren.intgemm.alphas.bin", "bd18594ac5a7f1d9997e7ea5bd80272082219cf8b1ce604766e4f207eb86abbf", 17140836),
    lex: file("lex.50.50.tren.s2t.bin", "d3374ab5267a73ee1aa1d926a298bd349426835f40856991ee959bc5cd4f9fce", 4662492),
    vocab: file("vocab.tren.spm", "ed328e589a3ccd70fd3ce7773fc3c01d8b7b18c687464cacf17fd40a8c0daadd", 811353),
  },
  "en>tr": { // Mozilla's older tiny models: smaller, noticeably weaker
    version: "1.0",
    model: file("model.entr.intgemm.alphas.bin", "ea3cd4ee09de190df265c78d84260e277a9a8a3ddff05eb55d72afe7fc0fdbf4", 17141051),
    lex: file("lex.50.50.entr.s2t.bin", "3aba0be842bd4c192659c781e6fdce8eb9b2b1fff29a40d22f75da369d59f46f", 3261300),
    vocab: file("vocab.entr.spm", "a220363d60391f7ce3df8ec9785424dbc00c24d5786d1a4308cf8ca3ed3385c2", 798793),
  },
  "pl>en": {
    version: "2.0",
    model: file("model.plen.intgemm.alphas.bin", "06dbab3baa3bbceab746bc6a3bba807878f38536382c03acddf59d3edf3b5d94", 31561787),
    lex: file("lex.50.50.plen.s2t.bin", "b295dfefa7022a62e105276e8c39fdfd67bffe588f4fd78583edd4e04ee0cb3b", 4964208),
    vocab: file("vocab.plen.spm", "2000f182efa8ce5f69bc3f9e574666b5bc2c0af684eedd32f69d15aa9021ea85", 821612),
  },
  "en>pl": {
    version: "2.1",
    model: file("model.enpl.intgemm.alphas.bin", "b0b59716bcc8f46b8dc6ab5c32a2732acaad42a5a6d9ae9b472526a1bb0d71d4", 31561787),
    lex: file("lex.50.50.enpl.s2t.bin", "d7d7b364673f633763c9f8f2e8ee9c7a184e92f4086e8b84abe870a2a8dbe5d5", 3540052),
    vocab: file("vocab.enpl.spm", "2000f182efa8ce5f69bc3f9e574666b5bc2c0af684eedd32f69d15aa9021ea85", 821612),
  },
  "ru>en": {
    version: "2.1",
    model: file("model.ruen.intgemm.alphas.bin", "aa0efa194b3dbd2da129ba0b8db8ef139126cb0914e57072f62061294746f1e2", 31561787),
    lex: file("lex.50.50.ruen.s2t.bin", "c944e753f298bbdf6506388de7257fb48cbd12c83e2807e2c284fc323771895b", 4397908),
    vocab: file("vocab.ruen.spm", "de8af5f87e231ee4016cec4bb482e6b584cb1ca34dcb624fc7b8398f25bb35df", 952371),
  },
  "en>ru": { // Mozilla's Android build (its release build is per platform)
    version: "2.1",
    model: file("model.enru.intgemm.alphas.bin", "184cb5cda528eeefc0f75f5d0035d787b71d74af135e3c5608d01ae02ecfb920", 31561787),
    lex: file("lex.50.50.enru.s2t.bin", "4d91839726b960e70b6d05c53d0cffd16262832b1c0e1ea99d66f412dcc6a239", 2774540),
    vocab: file("vocab.enru.spm", "56ee63e14e8cb926c394242adc3ed7cc602644c3d33058cff2ce2959d52a6258", 904455),
  },
};

/** The languages with the full translator: both ways with English listed. */
export const LANGUAGES_WITH = Object.keys(WAYS).filter((way) => way.endsWith(">en")).map((way) => way.split(">")[0]).filter((lang) => WAYS[`en>${lang}`]);

/** A language's files, both ways (each once: a vocabulary both ways share is one file). */
export function filesOf(lang) {
  const seen = new Map();
  for (const way of [`${lang}>en`, `en>${lang}`]) for (const kind of ["model", "lex", "vocab"]) if (WAYS[way]) seen.set(WAYS[way][kind].url, WAYS[way][kind]);
  return [...seen.values()];
}

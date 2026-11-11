// Luxembourgish, in the 2019 official spelling (lang/index.js has what each field means). Nouns are capitalized, as in
// German, so dictionary forms keep their case; a word that drops its n by the n-rule (drénke, hu) is headworded whole
// (drénken, hunn), and a word joined to d' (d'Gare) under the bare noun (Gare).

export default {
  name: "Luxembourgish",
  locale: "lb-LU",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  abbreviations: ["hr.", "fr.", "dr.", "prof.", "nr.", "tel.", "asw.", "z.b.", "z.", "b.", "bzw.", "ca.", "st.", "wgl."],
  stray: ["net", "och", "et", "nach", "den", "zu"],
  patterns: {
    present: { name: "Verb endings with ech, du, mir and the rest", about: "Most verbs end in -en with ech, mir and si (they), -s with du and -t with hien, si (she) and Dir: ech wunnen, du wunns, hie wunnt, mir wunnen.", after: [] },
    v2: { name: "Verb second", about: "In a statement the verb comes second. Start with a time word, and the subject moves after the verb: Muer gi mir an d'Stad (tomorrow go we into the town).", after: ["present"] },
    question: { name: "Questions: verb first or after the question word", about: "In a yes-or-no question the verb comes first; after a question word, it comes next: Wou wunns du? (where live you?).", after: ["v2"] },
    gender: { name: "den, d', en, eng", about: "Every noun is masculine, feminine or neuter. the is den with a masculine noun and d' with the rest (den Hond, d'Kaz, d'Haus, d'Kanner); a is en, or eng with a feminine noun.", after: [] },
    "n-rule": { name: "The n that comes and goes", about: "Articles, pronouns, verb forms and most words ending in -en drop their final n (both letters of -nn) before most consonants, and keep it before a vowel, d, h, n, t or z, and before sentence punctuation or a slash; with a hyphen or an opening quotation mark between, the next word decides: den Hond but de Bus, ech drénke Kaffi but ech drénken Téi, mir si fort but mir sinn do.", after: ["gender"] },
    dative: { name: "dem and der: after mat and vun, and an or op for where", about: "After mat (with) and vun (from), and after an (in) or op (on) for where something is, the is dem with a masculine or neuter noun, often joined (mam, am, um, vum), and der with a feminine one: mam Bus (with-the bus), an der Kichen (in the kitchen). Going somewhere, an and op keep den and d': an d'Stad (into the town).", after: ["gender"] },
    net: { name: "Where net goes", about: "net (not) usually comes near the end, after the object and the time words: Ech verstinn dat net (I understand that not).", after: ["v2"] },
    keen: { name: "keen, keng: no, not a", about: "Before a noun, Luxembourgish says keen (no) where English says not a or not any, keng with a feminine or plural noun: Ech hu keen Auto (I have no car), keng Zäit (no time).", after: ["gender"] },
    possessive: { name: "mäin, meng: my", about: "my is mäin with a masculine or neuter noun (mäi before most consonants, by the n-rule) and meng with a feminine or plural one: mäi Papp (my dad), meng Mamm (my mom), meng Schlësselen (my keys).", after: ["gender", "n-rule"] },
    perfect: { name: "The past: hunn + a verb at the end", about: "To talk about the past, use hunn (have) and put the main verb in its past form at the end: Ech hunn d'Kichen gebotzt (I have the kitchen cleaned).", after: ["v2"] },
    "sinn-perfect": { name: "The past with sinn", about: "Verbs of going from place to place, and a few more, take sinn (be) instead of hunn: Mir sinn an d'Vakanz gefuer (we are into the vacation gone).", after: ["perfect"] },
    modal: { name: "wëllen, kënnen, mussen: second verb last", about: "With wëllen (want), kënnen (can) or mussen (must), the second verb goes to the end, with no word for to: Ech wëll Lëtzebuergesch léieren (I want Luxembourgish learn).", after: ["v2"] },
    separable: { name: "Verbs that split", about: "Verbs like opstoen (get up) split: the verb comes second and the little word (op) goes to the end: Ech stinn um siwen Auer op (I stand at seven o'clock up).", after: ["v2"] },
    "et-gett": { name: "et gëtt: there is", about: "et gëtt (it gives) says there is or there are: Et gëtt keng Mëllech méi (it gives no milk more: there's no more milk).", after: ["v2"] },
    gaer: { name: "gär: liking to do", about: "To say you like doing something, put gär (gladly) after the verb: Ech drénke gär Kaffi (I drink gladly coffee); Ech hätt gär (I would have gladly) is I'd like.", after: ["v2"] },
    dir: { name: "Dir: you, politely", about: "To anyone you speak to politely, one person or more, you is Dir, with a capital D, and the verb takes its dir form, usually ending in -t (but Dir sidd: you are): Wou wunnt Dir? (where live you?), Kënnt Dir mir hëllefen? (can you me help?). Several friends are dir, without the capital.", after: ["present"] },
  },
};

// Yiddish, in standard YIVO orthography (lang/index.js has what each field means), is written right to left. װ, ױ and
// ײ are the single Unicode ligature characters U+05F0–U+05F2; pointed letters such as אַ, אָ, פּ, פֿ, בֿ, כּ, תּ, שׂ,
// וּ, יִ and ײַ are kept. Hebrew-Aramaic words keep their traditional spelling and alone carry a lowercase standard
// YIVO romanization as their reading, shown over the word until it is known well. Other words are read as written and carry
// none. Verbs are headworded by the infinitive, nouns by the singular without an article and adjectives by the base form.

export default {
  name: "Yiddish",
  locale: "yi",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  direction: "rtl",
  readings: "roman",
  abbreviations: [],
  stray: ["אױב","צװישן"],
  patterns: {
    present: { name: "Present-tense endings", about: "Most verbs use the bare stem with איך, -סט with דו, -ט with ער, זי, עס or איר, and -ן or -ען with מיר and זײ; after a stem ending in ס or ז, the דו ending fuses to -ט, as in דו הײסט and דו מוזט.", after: [] },
    reflexive: { name: "Verbs with זיך", about: "Some verbs use the same זיך with every subject: איך פֿיל זיך מיד, די קינדער שפּילן זיך, מיר לערנען זיך ייִדיש.", after: ["present"] },
    be: { name: "Being: זײַן", about: "זײַן is irregular in the present: איך בין, דו ביסט, ער, זי or עס איז, מיר or זײ זײַנען, and איר זײַט.", after: ["present"] },
    v2: { name: "The verb comes second", about: "The conjugated verb takes the second place in a main clause. Put a time first, and the subject follows the verb: מאָרגן אַרבעט איך (tomorrow work I).", after: ["present"] },
    subordinate: { name: "Dependent clauses with אַז, װײַל and װען", about: "After אַז, װײַל or װען, everyday standard Yiddish normally keeps the finite verb after the subject: װײַל איך בין מיד (because I am tired).", after: ["v2"] },
    gender: { name: "Masculine, feminine and neuter", about: "Every noun has a gender: דער טיש is masculine, די טיר feminine and דאָס הױז neuter. Articles, demonstratives and describing words follow that gender.", after: [] },
    definite: { name: "דער, די, דאָס: the", about: "דער goes with a masculine singular noun, די with a feminine noun or any plural, and דאָס with a neuter noun: דער צוג, די גאַס, דאָס הױז, די קינדער.", after: ["gender"] },
    indefinite: { name: "אַ and אַן: a, an", about: "Use אַ before a consonant sound and אַן before a vowel sound: אַ בעט, אַן עפּל. There is no plural form.", after: ["gender"] },
    accusative: { name: "The accusative: דעם and מיך", about: "A masculine דער becomes דעם when it is the direct object—דער אױטאָבוס קומט, but איך נעם דעם אױטאָבוס—while feminine די, neuter דאָס and plural די do not change; personal pronouns have object forms too, such as מיך for איך in רוף מיך.", after: ["gender","definite"] },
    dative: { name: "The dative: דעם, דער and מיר", about: "Use the dative for a recipient and after מיט or צו, and after location prepositions such as אין or אױף: גיב מיר װאַסער, מיט דעם חבֿר, צו דער סטאַנציע, אױף דער גאַס; masculine and neuter דער or דאָס become דעם, feminine די becomes דער, and איך becomes מיר.", after: ["gender", "definite"] },
    plural: { name: "Several plural endings", about: "Plural endings vary by word; common endings are -ן/-ען, -ס, -ער and -עך, as in טיש/טישן, מאַמע/מאַמעס, קינד/קינדער and מײדל/מײדלעך, while Hebrew-origin words often have traditional plurals such as חבֿר/חבֿרים (khaver/khaveyrim).", after: ["gender"] },
    adjective: { name: "Adjective endings before a noun", about: "Before a noun, an adjective usually takes an ending for gender, article and case: דער גרױסער טיש, די רױטע טיר, אין אַ קלײנער דירה. Before an indefinite singular neuter noun it normally has no ending: אַ קלײן הױז, װאַרעם װאַסער. After איז it stays in its base form: דאָס הױז איז קלײן.", after: ["gender", "definite", "indefinite"] },
    possessive: { name: "My and your: מײַן, דײַן", about: "מײַן, דײַן, זײַן, איר, אונדזער and אײַער stay unchanged before a singular noun and add -ע before a plural noun: מײַן שװעסטער, מײַנע שליסלען, אונדזער הױז, אונדזערע קינדער.", after: ["plural"] },
    negation: { name: "Not and no: נישט, קײן", about: "נישט negates a verb, description or definite thing. Before an indefinite noun, קײן means no or not any, commonly with נישט: איך האָב נישט קײן ברודער.", after: ["v2", "indefinite"] },
    question: { name: "Questions: tone, verb first, צי and question words", about: "Most spoken yes-or-no questions keep statement order and use a questioning tone; another form puts the verb before the subject, either first or after צי. When דו follows the verb, it joins it as -ו: דו קומסט, but קומסטו? Question words such as װאָס, װער, װוּ, װען and װי begin direct questions; an indirect question keeps ordinary clause order: זאָג מיר װען דו קומסט.", after: ["v2"] },
    imperative: { name: "Requests and commands", about: "For one person, use the short verb form: קום, זאָג, גיב; for several people or polite איר, use the -ט form: קומט, זאָגט, גיט; ביטע makes a request polite, while an infinitive can head a to-do item or impersonal instruction.", after: ["present"] },
    separable: { name: "Verbs whose prefix moves", about: "Prefixes such as אַרױס־, אָפּ־, אױף־ and אָן־ are in the same written word as an infinitive or participle but stand separately after a present-tense or command verb; adverbs and object pronouns may come before the separated prefix, while a full noun object normally follows it: איך גײ יעדן טאָג אַרױס, מאַך צו די טיר, and רוף מיך מאָרגן אָן.", after: ["v2"] },
    past: { name: "The past with האָבן or זײַן", about: "Everyday past statements use האָבן or, with motion and a few other verbs, זײַן plus a participle: איך האָב געקױפֿט; מיר זײַנען געגאַנגען. The participle normally comes late in the clause.", after: ["v2","have","be"] },
    future: { name: "The future: װעל plus an infinitive", about: "װעל changes with the subject and the main verb stays in the infinitive: איך װעל אַרבעטן, איר װעט קומען, מיר װעלן עסן.", after: ["present", "v2"] },
    have: { name: "Having: האָבן", about: "האָבן means to have and changes with the subject: איך האָב, דו האָסט, ער האָט, מיר האָבן, איר האָט.", after: ["present"] },
    "there-is": { name: "There is: ס׳איז דאָ", about: "ס׳איז דאָ or עס איז דאָ says something is present or available. עס איז נישטאָ says it is absent: עס איז נישטאָ קײן מילך.", after: ["be","indefinite"] },
    modal: { name: "Can, must and want", about: "קענען, מוזן and װעלן use forms such as קען, מוז and װיל, followed by an infinitive near the end with no word for to: איך מוז איצט אַהײם גײן.", after: ["present", "v2"] },
    demonstrative: { name: "This: דער דאָזיקער and דאָס", about: "Standing alone, דאָס means this or that: דאָס איז מײַן משפּחה. Before a noun, the form agrees with it: דער דאָזיקער דאָקטער, די דאָזיקע גאַס, דאָס דאָזיקע בוך.", after: ["gender", "definite", "adjective"] },
  },
};

// Basque, as standard Basque (Batua) writes it (lang/index.js has what each field means). A word carries its case at its
// end (etxean: in the house), and its dictionary form is the bare word (etxe); docs/languages/mutations-and-cases.md.

export default {
  name: "Basque",
  locale: "eu-ES",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "lower",
  abbreviations: ["k.", "or.", "adib.", "etab.", "zk.", "jn.", "and.", "ik."],
  stray: ["ez", "da", "dut", "bat", "eta", "ere"],
  patterns: {
    "article-a": { name: "The article: -a at the end", about: "The article -a joins the end of the whole noun phrase, after any describing word: etxea (the house), etxe handia (the big house); with izan it can also appear where English uses a, as in irakaslea da (is a teacher).", after: [] },
    plural: { name: "The plural: -ak", about: "-ak marks the plural with the (etxeak: the houses), and the verb and describing words follow it: Etxeak handiak dira (houses-the big-the are); in Aitak, the -k is the doer's ending on one dad, not a plural.", after: ["article-a"] },
    "verb-last": { name: "The verb at the end", about: "The verb usually comes last, with its helper word after it: Nire laguna Bilbon bizi da (my friend in-Bilbao living is).", after: [] },
    location: { name: "Where: -n, -ra, -tik", about: "-n is in or at, -ra is to and -tik is from, joined to the end of the place: etxean (in the house), etxera (to the house), etxetik (from the house).", after: ["article-a"] },
    comitative: { name: "With: -rekin", about: "-rekin (with) joins the end of the word: lagunarekin (with the friend), lagunekin (with friends), nirekin (with me).", after: ["article-a"] },
    genitive: { name: "Of, 's and my: -ren", about: "-ren says whose, and comes before what's owned; my and your are nire and zure: lagunaren etxea (friend-the's house-the), nire ama (my mom).", after: ["article-a"] },
    ergative: { name: "Who does it to something: -k", about: "When someone does something to something, the doer takes -k: Nik ordainduko dut (I-k pay-will I-have-it), Aitak autoa garbitzen du (dad-k car-the washing has-it).", after: ["article-a", "ukan"] },
    izan: { name: "izan: am, is, are", about: "izan says who or what someone is: naiz (am), zara (are), da (is), gara (we are), dira (they are): Nire ama irakaslea da (my mom teacher-the is).", after: ["verb-last"] },
    egon: { name: "egon: to be somewhere", about: "egon says where someone or something is: nago (I am), zaude (you are), dago (is), daude (are): Ama sukaldean dago (mom kitchen-in is).", after: ["izan"] },
    ukan: { name: "ukan: have", about: "dut (I have), duzu (you have), du (has); with more than one thing, ditut, dituzu, ditu: Auto bat dut (car one I-have), Bi lagun ditut (two friend I-have-them).", after: [] },
    "aux-present": { name: "Usually and now: -tzen + helper", about: "A verb ending in -tzen or -ten with its helper (naiz for coming and going, dut for doing something to something) says what you usually do or what's the case now: Autobusez joaten naiz (by-bus going I-am), Ez dut ulertzen (not I-have-it understanding); ari picks out an action in progress.", after: ["izan", "ukan"] },
    "aux-past": { name: "Completed: plain form + helper", about: "The verb's plain form with dut, duzu, naiz… says something is done, which English says with a simple past or have: Kafea edan dut (coffee drunk I-have-it: I had coffee, or I've had coffee), Liburua irakurri dut (book-the read I-have-it).", after: ["aux-present"] },
    future: { name: "Will: -ko or -go + helper", about: "-ko or -go on the verb, with its helper, says what will happen: Bihar deituko dizut (tomorrow call-will I-you), Mendira joango gara (mountain-to go-will we-are).", after: ["aux-present"] },
    ari: { name: "Right now: ari + helper", about: "-tzen ari with naiz, zara, da… says what's going on right now: Liburu bat irakurtzen ari naiz (book one reading busy I-am).", after: ["aux-present"] },
    negation: { name: "ez first, helper next", about: "ez (not) pulls the helper right after it, and the main verb goes to the end: Ez dut ulertzen (not I-have-it understanding).", after: ["aux-present"] },
    question: { name: "Question words before the verb", about: "A question word goes right before the verb: Non dago tren geltokia? (where is train station-the?), Zer jan nahi duzu? (what eat want you-have?).", after: ["verb-last"] },
    partitive: { name: "Any: -rik", about: "-rik can mark an unspecified amount or kind, often English any, in negative sentences and questions about whether something exists: Ez dago esnerik (not is any-milk), Ogirik ba al dago? (any-bread is there?).", after: ["negation"] },
    gustatu: { name: "Liking: gustatzen zait", about: "Basque says what you like pleases you: Kafea gustatzen zait (coffee-the pleasing is-to-me), Gustatzen zaizu? (pleasing is-to-you?).", after: ["izan"] },
    "nahi-behar": { name: "Want and need: nahi, behar", about: "nahi (want) and behar (need) follow the thing wanted or needed, or a verb's plain form, with dut, duzu…: Kafe bat nahi dut (coffee one want I-have), Ura edan nahi dut (water drink want I-have), Taxi bat hartu behar dugu (taxi one take need we-have).", after: ["ukan"] },
  },
};

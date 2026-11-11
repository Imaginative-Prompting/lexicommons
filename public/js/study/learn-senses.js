// Which of a word's senses a sentence uses, read off the sentence's own word-for-word English (its literal line): a pack writes one line
// per sentence, in chunks that may hold several words, never a gloss per word, so a word's meaning here is the senses of its whole
// gloss (WORDS, or the senses its form can carry) whose words that line has. Pure, no DOM: plain Node tests it (scripts/test-learn-senses.mjs).
// "naar" (to, toward; at; for; like (taste, smell); unpleasant, nasty) in "Tomorrow go we to grandma" is "to, toward".

// Words a sense names that say nothing about which sense it is.
const QUIET = new Set(["a", "an", "the", "of", "one", "one's", "someone", "something", "somebody", "sb", "sth", "etc"]);
const wordsOf = (text) => String(text ?? "").toLocaleLowerCase("en").replace(/[’']/g, "'").match(/[a-z0-9']+/g) ?? [];

// A sense's alternatives ("to, toward" is two), each as the words that must all be in the line: its parenthesis left out ("like (taste,
// smell)" is "like"), a verb's "to" (to drink: drink) and the quiet words dropped, unless nothing else is left ("to" itself).
function alternatives(sense) {
  return sense
    .replace(/\([^)]*\)/g, " ")
    .split(/,|\//)
    .map((alt) => {
      const all = wordsOf(alt);
      const verb = all[0] === "to" && all.length > 1 ? all.slice(1) : all;
      const loud = verb.filter((word) => !QUIET.has(word));
      return loud.length ? loud : verb;
    })
    .filter((alt) => alt.length);
}

// English verbs whose forms aren't the word plus an ending: the line says "are" or "went" where a sense says "to be" or "to go".
const IRREGULAR = {
  be: "am is are was were been being 'm 're 's",
  have: "has had having 've 'd",
  do: "does did done doing",
  go: "goes went gone going",
  get: "got gotten getting",
  make: "made",
  take: "took taken",
  see: "saw seen",
  come: "came",
  know: "knew known",
  think: "thought",
  say: "said",
  give: "gave given",
  find: "found",
  tell: "told",
  become: "became",
  leave: "left",
  feel: "felt",
  bring: "brought",
  begin: "began begun",
  keep: "kept",
  hold: "held",
  write: "wrote written",
  stand: "stood",
  hear: "heard",
  mean: "meant",
  meet: "met",
  run: "ran running",
  pay: "paid",
  sit: "sat sitting",
  speak: "spoke spoken",
  lie: "lay lain lying",
  lead: "led",
  grow: "grew grown",
  lose: "lost",
  fall: "fell fallen",
  send: "sent",
  build: "built",
  understand: "understood",
  draw: "drew drawn",
  break: "broke broken",
  spend: "spent",
  drive: "drove driven",
  buy: "bought",
  wear: "wore worn",
  choose: "chose chosen",
  eat: "ate eaten",
  drink: "drank drunk",
  sleep: "slept",
  swim: "swam swum swimming",
  sing: "sang sung",
  fly: "flew flown",
  forget: "forgot forgotten",
  catch: "caught",
  teach: "taught",
  fight: "fought",
  throw: "threw thrown",
  sell: "sold",
  win: "won winning",
  steal: "stole stolen",
  hide: "hid hidden",
  ride: "rode ridden",
  shake: "shook shaken",
  wake: "woke woken",
  hang: "hung",
  shoot: "shot",
  can: "could",
  will: "would 'll",
  shall: "should",
  may: "might",
};
const IRREGULAR_FORMS = Object.fromEntries(Object.entries(IRREGULAR).map(([word, forms]) => [word, new Set(forms.split(" "))]));

// An English word of the line standing for a sense's word: the same; one of its forms above; or it with an ending English adds (drinks,
// going, boxes, tried, stopped).
function stands(lineWord, word) {
  if (lineWord === word || IRREGULAR_FORMS[word]?.has(lineWord)) return true;
  if (word.length < 3) return false;
  if (word.endsWith("y") && [`${word.slice(0, -1)}ies`, `${word.slice(0, -1)}ied`].includes(lineWord)) return true;
  if ([`${word}${word.at(-1)}ed`, `${word}${word.at(-1)}ing`].includes(lineWord)) return true;
  const stem = word.replace(/e$/, "");
  if (!lineWord.startsWith(stem)) return false;
  return ["s", "es", "d", "ed", "ing", "e", "er", "est", "'s"].includes(lineWord.slice(stem.length));
}

/**
 * The senses of `gloss` (its "; " parts, as written) whose words the literal line uses, in the gloss's order; [] when none does. A gloss of
 * one sense is returned whole only if the line uses it too, so a caller can tell "this one" from "not said".
 */
export function sensesIn(gloss, literal) {
  return senseMatches(gloss, wordsOf(literal)).map((one) => one.sense);
}

// Each sense the line uses, with the line words (by place) each of its alternatives that the line has would take.
function senseMatches(gloss, line) {
  const senses = String(gloss ?? "")
    .split(";")
    .map((sense) => sense.trim())
    .filter(Boolean);
  return senses
    .map((sense) => ({ sense, uses: alternatives(sense).map((alt) => alt.map((word) => line.findIndex((lineWord) => stands(lineWord, word)))).filter((at) => at.every((i) => i >= 0)) }))
    .filter((one) => one.uses.length);
}

/**
 * The same for every word of one sentence at once (glosses: each word's gloss, or null): a line word one word's only sense takes isn't
 * another's too, so where a word has several senses the line has, those whose every alternative needs a word another has taken go (Ze in
 * "She is happy with her work" is she, not her: haar has it). Never all of them. [[sense…]] per word, as sensesIn.
 */
export function sentenceSenses(glosses, literal) {
  const line = wordsOf(literal);
  const found = glosses.map((gloss) => (gloss ? senseMatches(gloss, line) : []));
  const taken = new Set();
  for (const one of found) if (one.length === 1 && one[0].uses.length === 1) for (const at of one[0].uses[0]) taken.add(at);
  return found.map((one) => {
    if (one.length < 2) return one.map((match) => match.sense);
    const free = one.filter((match) => match.uses.some((at) => at.every((i) => !taken.has(i))));
    const kept = free.length ? free : one;
    // A sense whose line words are all inside another's goes to it ("at home" over "home").
    const words = (match) => new Set(match.uses.flat());
    const inside = (a, b) => a !== b && [...words(a)].every((i) => words(b).has(i)) && words(b).size > words(a).size;
    return kept.filter((match) => !kept.some((other) => inside(match, other))).map((match) => match.sense);
  });
}

/**
 * Whether the drawing a lesson gave a word belongs beside a sentence (learn-more.js: a word's page opened from a card, the card's sentence first):
 * the sentence uses the sense the lesson teaches. Its literal line has the lesson's English itself (`taught`, as a lesson writes it: "halen =
 * fetch", "the tire"; steeds "repeatedly", in no sense of its gloss), or every sense the line uses for the word at `at` (sentenceSenses, each
 * word's gloss in `glosses`) is one of the gloss's that the lesson's English names (fetch: "to get, to fetch", so "Get you bread" fits). A gloss
 * of one sense fits when that sense is the lesson's. A line that uses another sense, or tells none, doesn't, nor does a gloss whose senses the
 * lesson's English names none of: a missing picture rather than a wrong one (halen's dog fetching a stick beside "we caught the train", band's
 * tire beside a music band, zu's overflowing coffee beside "I go to school").
 */
// How a sentence's own English uses a word whose every use a word-for-word line writes alike: HAVE as "have" whether it's owned ("I have a dog"),
// the perfect's helper ("I have eaten") or a must ("I have to go"); the answer "no" ("No, thanks") and the "no" of "there's no milk". A lesson
// that teaches one of these words in its English shows its drawing only where the sentence's English uses it as the lesson's own sentences
// do (usesIn): "I'm hungry", "He's twenty" and "There are two bathrooms" don't say "have" at all, and the literal "I have hunger" can't tell.
const USE_WORDS = { have: "have", has: "have", had: "have", be: "be", am: "be", is: "be", are: "be", was: "be", were: "be", been: "be", being: "be", no: "no" };
// A participle in the clause after HAVE or BE makes it a helper ("has that cyclist won", "have clearly been"): an -ed word (not one of these),
// or an irregular one; not one that's an adjective after a determiner ("a broken phone").
const PARTICIPLES = new Set(
  ("been done gone seen taken given eaten written spoken broken chosen driven fallen forgotten gotten hidden ridden risen shaken stolen thrown " +
    "woken worn known grown drawn flown sung swum drunk begun sunk rung shown beaten bitten frozen forgiven mistaken torn sworn had made said " +
    "found told left felt brought kept held stood heard meant met paid sat led lost sent built understood spent bought caught taught fought sold " +
    "won hung shot slept read put cut set let hit hurt shut thought come become run stung struck stuck dug spun swung fed fled lit laid sought " +
    "wept swept crept dealt dreamt learnt burnt lent bent spread split quit bet burst cast broadcast upset cost ground stunk shrunk sprung slung " +
    "clung wrung strung flung bound wound slid sped shone woven").split(" "),
);
const NOT_PARTICIPLES = new Set("need seed feed deed reed weed heed speed breed bleed greed shed hundred sacred naked wicked bread beloved".split(" "));
const participle = (word) => PARTICIPLES.has(word) || (word.length > 3 && word.endsWith("ed") && !NOT_PARTICIPLES.has(word));
const DETERMINERS = new Set("a an the my your his her its our their this these those some any no every each".split(" "));
// Words between a verb and what it takes that say nothing about the use ("have never been", "have already eaten").
const BETWEEN = new Set("not never already just ever also still always really only all both even often recently finally actually probably got".split(" "));
// Where a clause ends: a mark, or a word that joins another clause on.
const PUNCT = /^[.,!?;:…—–]$/;
const JOINS = new Set("and but or because so if when while than though although whether".split(" "));
// The sentence's English as words and marks, its contractions spelled out ("I've" → I have, "don't" → do not, "there's" → there is).
function englishTokens(text) {
  return String(text ?? "")
    .toLocaleLowerCase("en")
    .replace(/[’']/g, "'")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bcan't\b/g, "can not")
    .replace(/n't\b/g, " not")
    .replace(/'ve\b/g, " have")
    .replace(/'re\b/g, " are")
    .replace(/'m\b/g, " am")
    .replace(/\b(there|here|it|that|what|where|who)'s\b/g, "$1 is")
    .match(/[a-z0-9]+(?:[-'][a-z0-9]+)*|[.,!?;:…—–]/g) ?? [];
}
// Each use the English makes of the USE_WORDS: "have:plain" (owns), "have:helper" (a participle in its clause), "have:to" (must), "no:alone" (the
// answer, a clause by itself), "no:plain" (none of something).
export function usesIn(text) {
  const tokens = englishTokens(text);
  const uses = new Set();
  tokens.forEach((token, i) => {
    const word = USE_WORDS[token];
    if (!word) return;
    let j = i + 1;
    while (BETWEEN.has(tokens[j])) j++;
    const next = tokens[j];
    if (next === undefined || PUNCT.test(next)) return uses.add(`${word}:alone`);
    if (next === "to") return uses.add(`${word}:to`);
    if (word !== "no")
      for (let k = j; k < tokens.length && !PUNCT.test(tokens[k]) && !JOINS.has(tokens[k]); k++)
        if (participle(tokens[k]) && !DETERMINERS.has(tokens[k - 1])) return uses.add(`${word}:helper`);
    uses.add(`${word}:plain`);
  });
  return uses;
}

/**
 * … (as below), and for a lesson whose English is one of the USE_WORDS (HAVE, BE, "no"), the sentence's English using them only as the lesson's
 * own sentences' English does, and its word-for-word line making no helper or must of them that theirs never make: "I'm hungry" says no have,
 * "I have eaten" helps, "I have to go" must, "There's no milk" isn't the answer "No, thanks"; the French "J'ai mangé" reads "I had pizza", but
 * its line "I have eaten a pizza" helps. means: the sentence's English; lesson: the lesson's own sentences that use the word, { means, literal }.
 * Without them, as before.
 */
// The USE_WORDS a lesson's English is, each alone (its subject, a verb's "to", do and not set aside: "I have", "to have", "doesn't have",
// "there is", "no"), never inside a phrase of more ("have to", "be able to": those say their own sense).
const ASIDE = new Set("i you he she it we they there do does did not".split(" "));
export function useWordsTaught(taught) {
  const words = new Set();
  for (const part of String(taught ?? "").split(";"))
    for (const alt of part.split(" = ").at(-1).replace(/\([^)]*\)/g, " ").split(/,|\//)) {
      const tokens = englishTokens(alt).filter((word) => !PUNCT.test(word));
      const rest = (tokens[0] === "to" ? tokens.slice(1) : tokens).filter((word) => !ASIDE.has(word));
      if (!rest.length) continue;
      // An alternative of its own sense ("lies" beside "is"): the lesson's English says which sense, as before.
      if (rest.length !== 1 || !USE_WORDS[rest[0]]) return new Set();
      words.add(USE_WORDS[rest[0]]);
    }
  return words;
}

export function pictureFits(glosses, literal, at, taught, { means, lesson } = {}) {
  if (!senseFits(glosses, literal, at, taught)) return false;
  const taughtWords = useWordsTaught(taught);
  if (!taughtWords.size || means === undefined || !lesson) return true;
  const ours = (uses) => [...uses].filter((use) => taughtWords.has(use.split(":")[0]));
  const lessonSays = new Set(lesson.flatMap((line) => ours(usesIn(line.means))));
  const lessonLines = new Set(lesson.flatMap((line) => ours(usesIn(line.literal))));
  const lineUses = ours(usesIn(literal));
  // The lesson's English never says it (geen "no": "I don't have any money"): the word-for-word lines are read against each other instead;
  // neither says it, nothing to tell by.
  if (!lessonSays.size) return !lessonLines.size || (lineUses.length > 0 && lineUses.every((use) => lessonLines.has(use)));
  const here = ours(usesIn(means));
  if (!here.length || !here.every((use) => lessonSays.has(use))) return false;
  return lineUses.every((use) => !/:(helper|to)$/.test(use) || lessonLines.has(use));
}

function senseFits(glosses, literal, at, taught) {
  const gloss = glosses[at];
  const english = String(taught ?? "")
    .split(";")
    .map((part) => part.split(" = ").at(-1).trim())
    .filter(Boolean);
  if (english.some((sense) => sensesIn(sense, literal).length)) return true;
  const lessons = sensesIn(gloss, english.join("; "));
  if (!lessons.length) return false;
  // A gloss of one sense, that sense the lesson's: the word means nothing else. (Whose sense it is is asked first: a pack's gloss of one sense
  // may be another than the lesson's, starter-de's zu "to" against path-de's "too", and the view takes the first pack's.)
  if (String(gloss ?? "").split(";").filter((sense) => sense.trim()).length < 2) return true;
  const here = sentenceSenses(glosses, literal)[at] ?? [];
  return here.length > 0 && here.every((sense) => lessons.includes(sense));
}

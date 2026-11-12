// The living design-system page (/design): every token, component and state, built with the same builders as the
// app (lx/ui.js) under the visitor's current appearance. The Appearance panel drives the theme engine (lx/theme.js),
// so a theme can be tried against everything at once. The page checks itself against the theming surface
// (lx/parts.js): every listed part must be shown here, and nothing unlisted may appear.

import * as ui from "./lx/ui.js";
import { el } from "./lx/ui.js";
import { sampleMark } from "./shell/sample-mark.js";
import { icon, ICON_NAMES, MEANING_ICON } from "./lx/icons.js";
import { SYMBOL_NAMES, symbol } from "./lx/symbols.js";
import { loadPictures, pictureNode } from "./study/pictures.js";
import { PARTS, STATE_ATTRIBUTES, THEMING_SURFACE_VERSION, checkSurface } from "./lx/parts.js";
import * as theme from "./lx/theme.js";
import { buildAppearance } from "./lx/appearance.js";
import * as motion from "./lx/motion.js";
import { itemById } from "./study/content.js";
import * as voice from "./study/voice.js";
import { recognisersSection } from "./design-speech.js";
import { librarySection } from "./design-library.js";
import { exploreSection } from "./design-explore.js";
import { aiSection } from "./design-ai.js";
import { studySection } from "./design-study.js";
import { practiceSection } from "./design-practice.js";
import { knowledgeSection } from "./design-know.js";
import { installRowNode, installSteps } from "./shell/settings-install.js";
import { platformById } from "./shell/install-guide.js";
import { knownWordCell, openReader } from "./read/reader.js";
import { parseText } from "./read/import-text.js";
import { demoBook, demoWeave } from "./read/demo-sample.js";
import { knownForShare } from "./read/woven-text.js";
import { celebration } from "./know/celebration-ui.js";
import { pathStrip, studyDoor } from "./study/doors.js";
import { chipRow, conceptBody } from "./study/after-answer.js";
import { rulePicture } from "./study/concept-picture.js";
import { edge } from "./lx/edge.js";
import { STATES as RIG_STATES, tinta } from "./character/rig/inkdrop/tinta.js";

// ---------- example content: real Dutch ----------

const CARDS = [
  {
    tags: [["Perfect tense: verb last", "moved"], ["gisteren", "slipping"]],
    words: [{ text: "Ik" }, { text: "heb" }, { text: "gisteren", state: "slipping" }, { text: "een" }, { text: "boek" }, { text: "gelezen." }],
    literal: [{ text: "I have" }, { text: "yesterday", moved: true }, { text: "a book" }, { text: "read", moved: true }],
    punct: ".",
    english: [0, 3, 2, 1],
    natural: "I read a book yesterday.",
  },
  {
    tags: [["Verb second", "moved"], ["oma", "new"]],
    words: [{ text: "Morgen" }, { text: "gaan" }, { text: "we" }, { text: "naar" }, { text: "oma.", state: "new" }],
    literal: [{ text: "Tomorrow" }, { text: "go", moved: true }, { text: "we" }, { text: "to grandma" }],
    punct: ".",
    english: [0, 2, 1, 3],
    natural: "Tomorrow we're going to Grandma's.",
  },
  {
    tags: [["dat: verb to the end", "moved"], ["weten", "right"]],
    words: [{ text: "Ik" }, { text: "weet", state: "right" }, { text: "dat" }, { text: "hij" }, { text: "morgen" }, { text: "komt." }],
    literal: [{ text: "I know that he" }, { text: "tomorrow" }, { text: "comes", moved: true }],
    punct: ".",
    english: [0, 2, 1],
    natural: "I know he's coming tomorrow.",
  },
];

// A Japanese card: its words as the pack splits them, each with kanji carrying its reading (学生 known, so hidden).
const JA_CARD = {
  tags: [["は: the topic", "moved"]],
  words: [{ text: "私", reading: "わたし" }, { text: "は" }, { text: "学生", reading: "がくせい", readingHidden: true }, { text: "です。" }],
  literal: [{ text: "I" }, { text: "a student" }, { text: "am", moved: true }],
  english: [0, 2, 1],
  natural: "I'm a student.",
};

const RIGHT_CARD = {
  tags: [["Separable verb: opbellen", "right"]],
  words: [{ text: "Ik" }, { text: "bel" }, { text: "je" }, { text: "morgen" }, { text: "op." }],
  literal: [{ text: "I call you" }, { text: "tomorrow" }, { text: "up", moved: true }],
  punct: ".",
  english: [0, 2, 1],
  natural: "I'll call you tomorrow.",
};

const WRONG_CARD = {
  tags: [["Question: verb first", "wrong"]],
  words: [{ text: "Hoe" }, { text: "gaat", state: "missed" }, { text: "het" }, { text: "met" }, { text: "je?" }],
  literal: [{ text: "How" }, { text: "goes", moved: true }, { text: "it" }, { text: "with you" }],
  punct: "?",
  english: null,
  natural: "How are you?",
};

const WOVEN = [
  "She walked into ",
  { nl: "de keuken", en: "the kitchen" },
  " and opened ",
  { nl: "het raam", en: "the window", state: "new" },
  ". Outside, ",
  { nl: "de buurman", en: "the neighbor" },
  " was already in ",
  { nl: "de tuin", en: "the garden" },
  ". ",
  {
    flipped: ["Hij zei dat hij ", { nl: "morgen", en: "tomorrow" }, " zou komen."],
    literal: [{ text: "He said that he" }, { text: "tomorrow", moved: true }, { text: "would come." }],
  },
  " She waved and put the kettle on.",
];

const LOOKUPS = {
  "de keuken": { en: "the kitchen", note: "A de-word", level: 3 },
  "het raam": { en: "the window", note: "A het-word · new today", level: 0 },
  "de buurman": { en: "the neighbor (a man)", note: "de buurvrouw: the neighbor (a woman)", level: 2 },
  "de tuin": { en: "the garden", note: "A de-word", level: 4 },
  morgen: { en: "tomorrow", note: "Also de morgen: the morning", level: 3 },
};

const MEANINGS = [
  ["right", "You knew it. Blue: the hue every kind of color vision keeps apart from a miss."],
  ["wrong", "A miss. Vermillion, never pure red, so it doesn't collapse into the right color."],
  ["slipping", "Known, but fading: it's due back soon. Amber."],
  ["new", "Meeting it for the first time. No hue: bright ink and a sparkle."],
  ["hint", "You used a hint, like the literal line or a first letter. No hue: dim ink, a dashed edge and a bulb."],
  ["moved", "In the literal line: a word sitting where Dutch puts it, not where English would. A highlighter mark and a dotted underline."],
];

const COLOUR_GROUPS = [
  ["Surfaces", ["--canvas", "--chrome", "--well", "--fill", "--fill-hover", "--fill-active"]],
  ["Lines", ["--hair", "--edge", "--edge-strong", "--ring"]],
  ["Ink", ["--ink-1", "--ink-2", "--ink-3", "--ink-4", "--solid", "--on-solid"]],
  ["Meaning", ["--m-right", "--m-right-bg", "--m-right-edge", "--m-wrong", "--m-wrong-bg", "--m-wrong-edge", "--m-slipping",
    "--m-slipping-bg", "--m-slipping-edge", "--m-new", "--m-new-edge", "--m-hint", "--m-hint-edge", "--m-moved-mark", "--m-moved-line"]],
  ["Strength", ["--strength-0", "--strength-1", "--strength-2", "--strength-3", "--strength-4"]],
];

// ---------- helpers ----------

const computed = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function section(id, title, intro, ...content) {
  return el(
    "section",
    { part: "section", id, class: "ds-section" },
    el("h2", { part: "section-title" }, title),
    intro ? el("p", { class: "lx-muted ds-intro-text" }, intro) : null,
    ...content,
  );
}

function demo(label, ...content) {
  return el("div", { class: "ds-demo" }, el("div", { class: "ds-demo-label lx-tiny" }, label), el("div", { class: "ds-demo-body" }, ...content));
}

/** A demo with a Reset button that builds it again (games are answered once). */
function resettable(label, build) {
  const body = el("div", { class: "ds-demo-body" }, build());
  const reset = ui.button("Reset", { variant: "fade", size: "sm", icon: "refresh", onclick: () => body.replaceChildren(build()) });
  return el("div", { class: "ds-demo" }, el("div", { class: "ds-demo-label lx-tiny ds-demo-head" }, label, reset), body);
}

/** A static row of one part in each of its states, labeled. */
function states(label, items) {
  return demo(
    label,
    el("div", { class: "ds-states" }, items.map(([caption, node]) => el("figure", { class: "ds-state" }, node, el("figcaption", { class: "lx-tiny lx-muted" }, caption)))),
  );
}

const withVar = (node, name, value) => {
  node.style.setProperty(name, value);
  return node;
};

function popover(nl) {
  const info = LOOKUPS[nl];
  return el(
    "div",
    { part: "word-popover", role: "status" },
    el("strong", { lang: "nl" }, nl),
    el("span", {}, info.en),
    el("span", { class: "lx-small lx-muted" }, info.note),
    el("div", { class: "lx-row" }, ui.strengthMeter(info.level), ui.iconButton("speaker", "Play audio")),
  );
}

// ---------- sections ----------

function meaningSection() {
  const rows = MEANINGS.map(([meaning, about]) =>
    el(
      "div",
      { class: "ds-meaning" },
      el("span", { class: "ds-meaning-swatch", "data-swatch": meaning }),
      el("div", { class: "ds-meaning-label" }, ui.badge(meaning)),
      el("p", { class: "lx-small lx-muted" }, about),
    ),
  );
  const miss = [
    ["Choice", el("button", { part: "choice", state: "wrong", type: "button", lang: "nl" }, el("span", {}, "Morgen we gaan"), icon("cross"))],
    ["Tile", el("button", { part: "tile", state: "wrong", type: "button", lang: "nl" }, "komt")],
    ["Gap", el("span", { part: "blank", state: "wrong", lang: "nl" }, "bellen")],
    ["Match", el("button", { part: "match-item", state: "wrong", type: "button", lang: "nl" }, "tuin")],
    ["Card word", el("button", { part: "target-word", state: "missed", type: "button", lang: "nl" }, "gaat")],
    ["Reader word", el("button", { part: "woven-word", state: "looked-up", type: "button", lang: "nl" }, "de buurman")],
    ["Session", ui.sessionProgress(["right", "wrong", "current"])],
  ];
  const right = [
    ["Choice", el("button", { part: "choice", state: "right", type: "button", lang: "nl" }, el("span", {}, "Morgen gaan we"), icon("check"))],
    ["Tile", el("button", { part: "tile", state: "right", type: "button", lang: "nl" }, "komt")],
    ["Gap", el("span", { part: "blank", state: "right", lang: "nl" }, "bel")],
    ["Match", el("button", { part: "match-item", state: "matched", type: "button", lang: "nl" }, "tuin")],
    ["Card word", el("button", { part: "target-word", state: "right", type: "button", lang: "nl" }, "weet")],
    ["Concept", ui.conceptTag("Verb second", "right")],
    // A word with its gloss, as the session's summary and the lists show it: with its reading while it's new.
    ["A word, new: its vowel marks", ui.conceptTag([{ text: "ספר", reading: "סֵפֶר", lang: "he" }, " · book"], "new")],
    ["A word, new: its reading over it", ui.conceptTag([{ text: "学生", reading: "がくせい", lang: "ja" }, " · student"], "new")],
    ["A word you know: as written", ui.conceptTag(["ספר", " · book"], "right")],
    ["Session", ui.sessionProgress(["right", "right", "current"])],
  ];
  return section(
    "meaning",
    "Meaning",
    "Six signals that read the same in every way of studying: a game, a card, the reader, or a conversation your AI grades. Each one carries an icon and a word as well as a color, so it holds up in any theme and for any eyes (checked under protanopia, deuteranopia and tritanopia).",
    el("div", { class: "ds-meanings" }, rows),
    states("The same miss, in every activity", miss),
    states("The same right answer, in every activity", right),
  );
}

function listeningSection() {
  const item = itemById.get("morgen-oma");
  const words = item.words.map(([text], i) => (i === item.words.length - 1 ? text + item.punct : text));
  const speak = (choice) => (options) => voice.speakItem(item, { ...options, choice });
  const voices = el("div");
  const renderVoices = () => {
    const chosen = voice.voiceChoices()[0]?.id;
    voices.replaceChildren(
      ui.group(
        "Voice",
        voice.voiceChoices().slice(0, 4).map((choice) =>
          ui.radioRow({ title: choice.name, sub: choice.about, name: "ds-voice", value: choice.id, checked: choice.id === chosen, trailing: ui.speakButton(speak(choice.id), { label: `Hear ${choice.name}` }) }),
        ),
      ),
    );
  };
  voice.onVoicesChange(renderVoices);
  renderVoices();
  const playingButton = ui.speakButton(() => null, { label: "Playing" });
  playingButton.setAttribute("data-state", "playing");
  const speakingWord = el("span", { part: "spoken-word", "data-speaking": "" }, "gaan");
  return section(
    "listening",
    "Listening",
    "Dutch you can hear: a recorded voice (each word lights up as it's spoken) or the device's own voice. The speak button plays it; pressing it again stops it. Settings → Study → Listening picks the voice.",
    demo("After an answer: the sentence, with its speak button", ui.spokenLine(words, speak())),
    demo("Picking a voice: each row has its own speak button", voices),
    states("Speak button", [
      ["ready", ui.speakButton(() => null)],
      ["playing", playingButton],
      ["with a label", ui.speakButton(() => null, { text: "Hear it" })],
    ]),
    states("Radio (a row in a list of choices)", [
      ["not chosen", el("input", { part: "radio", type: "radio", name: "ds-radio-states", "aria-label": "Not chosen" })],
      ["chosen", el("input", { part: "radio", type: "radio", name: "ds-radio-states", checked: true, "aria-label": "Chosen" })],
    ]),
    states("Words of a spoken line", [
      ["plain", el("span", { part: "spoken-word" }, "Morgen")],
      ["speaking", speakingWord],
    ]),
  );
}

function speakingSection() {
  const mic = (state, level = 0) => {
    const button = ui.micButton();
    if (state) button.lxState(state);
    button.lxLevel(level);
    return button;
  };
  const said = ui.saidLine([
    { text: "Ik", result: "right" },
    { text: "heb", result: "close" },
    { text: "gisteren", result: "order" },
    { text: "een", result: "missing" },
    { text: "boek", result: "right" },
    { text: "gelezen.", result: "wrong" },
  ]);
  return section(
    "speaking",
    "Speaking",
    "Say it: press the microphone and read the sentence aloud (or say it from the English). The ring follows how loud you are while it listens. What you said comes back word by word, each result with its own line as well as its color.",
    states("Microphone button", [
      ["ready", mic(null)],
      ["asking", mic("asking")],
      ["loading", mic("loading")],
      ["listening", mic("listening")],
      ["hearing", mic("hearing", 0.6)],
      ["thinking", mic("thinking")],
    ]),
    demo("What you said: right · close · in the wrong place · missed · wrong", said),
    states("Words of it", ["right", "close", "order", "wrong", "missing"].map((result) => [result, el("span", { part: "said-word", state: result, lang: "nl" }, "gisteren")])),
  );
}

function studyCardSection() {
  return section(
    "study-card",
    "Study card",
    "The Dutch sentence, the literal line in Dutch word order with moved words marked, and natural English behind a tap. In a session a card is about one word, boxed; a tap on any other word shows its meaning, and is never a miss or a grade. Where the literal line sits is a preset (Below, Above, On tap, Off).",
    el("p", { part: "attribution-prompt" }, icon("tag"), "Tap any word for its meaning."),
    el("div", { class: "ds-grid" }, CARDS.map((card, i) => ui.studyCard(card, { audio: i === 0 ? (options) => voice.speakItem(itemById.get("boek-gelezen"), options) : undefined }))),
    resettable("Behind a button, as in a session: the literal line slides from English order into Dutch order", () => ui.studyCard(CARDS[0], { reveal: "button" })),
    demo("After an answer", el("div", { class: "ds-grid" }, ui.studyCard(RIGHT_CARD, { state: "right" }), ui.studyCard(WRONG_CARD, { state: "wrong" }))),
    resettable("About one word, as a session's card is: the word boxed, and on revealing, what it means with the word it's a form of", () => {
      const meaning = ui.wordMeaning({ said: "gelezen", lemma: "lezen", gloss: "to read" }, { lang: "nl", state: "hidden" });
      const words = CARDS[0].words.map((word) => ({ ...word, state: /^gelezen/.test(word.text) ? "target" : undefined }));
      return ui.studyCard({ ...CARDS[0], tags: [["New word", "new"]], words, meaning }, { reveal: "button", onWord: () => {} });
    }),
    demo(
      "A word's meaning, after a tap: it takes no presses, so what's under it still answers",
      el("div", { part: "word-popover" }, ui.wordMeaning({ said: "ben", lemma: "zijn", gloss: "to be; his, its" }, { lang: "nl" })),
      el("div", { part: "word-popover" }, ui.wordMeaning({ said: "thuis", gloss: "at home; home" }, { lang: "nl" })),
    ),
    demo(
      "In Japanese (written without spaces): each word's reading over its kanji until you know the word, then hidden in its place; a tap shows it again (here 学生 is known)",
      el("div", { class: "ds-grid" }, ui.studyCard(JA_CARD, { lang: "ja" })),
    ),
    states("A word's reading", [
      ["shown", el("span", { lang: "ja", class: "ds-reading-word" }, el("ruby", {}, "学", el("rt", { part: "reading" }, "がく")), el("ruby", {}, "生", el("rt", { part: "reading" }, "せい")))],
      ["hidden (a word you know)", el("span", { lang: "ja", class: "ds-reading-word" }, el("ruby", {}, "学", el("rt", { part: "reading", state: "hidden" }, "がく")), el("ruby", {}, "生", el("rt", { part: "reading", state: "hidden" }, "せい")))],
      ["pinyin", el("span", { lang: "zh", class: "ds-reading-word" }, el("ruby", {}, "学", el("rt", { part: "reading" }, "xué")), el("ruby", {}, "生", el("rt", { part: "reading" }, "shēng")))],
      // Arabic and Hebrew (vowels): the word itself with its vowel marks, and as written once you know it.
      ["vowels", el("span", { lang: "he", dir: "rtl" }, el("span", { class: "lx-word" }, el("span", { part: "reading", variant: "vowels" }, "סֵפֶר"), el("span", { class: "lx-bare" }, "ספר")))],
      ["vowels, hidden (a word you know)", el("span", { lang: "he", dir: "rtl" }, el("span", { class: "lx-word" }, el("span", { part: "reading", variant: "vowels", state: "hidden" }, "סֵפֶר"), el("span", { class: "lx-bare" }, "ספר")))],
    ]),
    states("Word-order toggle: press anywhere on it to flip", (() => {
      const dutch = ui.literalLine(CARDS[0]);
      const english = ui.literalLine(CARDS[0]);
      english.lxSetOrder("english", { animate: false });
      return [["Dutch order", ui.orderSwitch(dutch)], ["English order", ui.orderSwitch(english)]];
    })()),
    states("Words in the sentence", [
      ["plain", el("button", { part: "target-word", type: "button", lang: "nl" }, "boek")],
      ["the one it's about", el("button", { part: "target-word", state: "target", type: "button", lang: "nl" }, "boek")],
      ["missed", el("button", { part: "target-word", state: "missed", type: "button", lang: "nl" }, "gaat")],
      ["new", el("button", { part: "target-word", state: "new", type: "button", lang: "nl" }, "oma")],
      ["slipping", el("button", { part: "target-word", state: "slipping", type: "button", lang: "nl" }, "gisteren")],
      ["right", el("button", { part: "target-word", state: "right", type: "button", lang: "nl" }, "weet")],
    ]),
  );
}

function gamesSection() {
  return section(
    "games",
    "Games",
    "Each game reports right and wrong per concept to the same knowledge model, with the same signals as everything else.",
    el(
      "div",
      { class: "ds-grid" },
      resettable("Choose", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "Tomorrow we're going to Grandma's."), ui.choiceList(["Morgen we gaan naar oma.", "Morgen gaan we naar oma.", "We gaan morgen oma naar."], 1))),
      resettable("Put it in Dutch order", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "I know he's coming tomorrow."), ui.arrange(["komt", "Ik", "morgen", "dat", "weet", "hij"], ["Ik", "weet", "dat", "hij", "morgen", "komt"], { moved: ["komt"] }))),
      resettable("Put the English in Dutch order, with a stray tile (drag or tap)", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "I read a book yesterday."), ui.arrange(["read", "did", "a book", "I have", "yesterday"], ["I have", "yesterday", "a book", "read"], { moved: ["yesterday", "read"], lang: "en" }))),
      resettable("Where does it go?", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "I read a book yesterday."), ui.placeWord(["Ik", "heb", "gisteren", "een", "boek"], "gelezen", 5, { punct: "." }))),
      resettable("Type the whole sentence", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "We missed the train."), ui.writeSentence("Type it in Dutch"))),
      resettable("Fill the gap", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "I'll call you tomorrow."), ui.fillSentence("Ik", "je morgen op.", ["bellen", "bel", "belt"], "bel"))),
      resettable("Type in the gap", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "I'll call you tomorrow."), ui.typeInGap("Ik", "je morgen op.", "bel", { lang: "nl", onCheck: () => {} }))),
      // Hebrew and Arabic: the choices with their vowel marks while the word is new, as the sentence's words have them.
      resettable("Fill the gap, with vowel marks (a new word)", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "I drink coffee."), ui.fillSentence([{ text: "אני", reading: "אֲנִי" }], [{ text: "קפה.", reading: "קָפֶה" }], [{ text: "שותה", reading: "שׁוֹתֶה" }, { text: "שתה", reading: "שָׁתָה" }, { text: "שותים", reading: "שׁוֹתִים" }], "שותה", { lang: "he" }))),
      resettable("Match", () => ui.matchGrid([["oma", "grandma"], ["morgen", "tomorrow"], ["boek", "book"], ["tuin", "garden"]])),
      resettable("Type it", () => el("div", { class: "lx-stack" }, el("p", { class: "lx-small lx-muted" }, "How are you? (literally: How goes it with you?)"), ui.typeAnswer("Hoe gaat het met je", "In Dutch…"))),
    ),
    states("Choices", [
      ["plain", el("button", { part: "choice", type: "button", lang: "nl" }, el("span", {}, "naar oma"), icon("check"))],
      ["selected", el("button", { part: "choice", state: "selected", type: "button", lang: "nl" }, el("span", {}, "naar oma"), icon("check"))],
      ["right", el("button", { part: "choice", state: "right", type: "button", lang: "nl" }, el("span", {}, "naar oma"), icon("check"))],
      ["wrong", el("button", { part: "choice", state: "wrong", type: "button", lang: "nl" }, el("span", {}, "oma naar"), icon("cross"))],
      ["dimmed", el("button", { part: "choice", state: "dimmed", type: "button", lang: "nl" }, el("span", {}, "oma naar"), icon("cross"))],
    ]),
    states("Tiles", [
      ["plain", el("button", { part: "tile", type: "button", lang: "nl" }, "morgen")],
      ["used", el("button", { part: "tile", state: "used", type: "button", lang: "nl" }, "morgen")],
      ["moved", el("button", { part: "tile", state: "moved", type: "button", lang: "nl" }, "komt")],
      ["right", el("button", { part: "tile", state: "right", type: "button", lang: "nl" }, "komt")],
      ["wrong", el("button", { part: "tile", state: "wrong", type: "button", lang: "nl" }, "komt")],
      ["dragging (left behind)", el("button", { part: "tile", state: "dragging", type: "button", lang: "nl" }, "morgen")],
      ["lifted (under the finger)", el("span", { part: "tile", state: "lifted", lang: "nl" }, "morgen")],
      ["drop (where it would land)", el("span", { part: "tile", state: "drop", lang: "nl" }, "morgen")],
    ]),
    states("Where does it go", [
      ["the word", el("span", { part: "place-word", lang: "nl" }, "gelezen")],
      ["the word, placed", el("span", { part: "place-word", state: "used", lang: "nl" }, "gelezen")],
      ["a gap", el("p", { part: "place-sentence", lang: "nl" }, el("span", {}, "boek"), el("button", { part: "place-gap", type: "button", "aria-label": "A gap" }))],
      ["right", el("span", { part: "place-gap", state: "right", lang: "nl" }, "gelezen")],
      ["wrong", el("span", { part: "place-gap", state: "wrong", lang: "nl" }, "gelezen")],
      ["where it goes", el("span", { part: "place-gap", state: "answer", lang: "nl" }, "gelezen")],
    ]),
    states("After a wrong answer", [
      ["the right order", el("div", { part: "arrange-key" }, ["Ik", "weet", "dat", "hij", "morgen"].map((w) => el("span", { part: "tile", lang: "nl" }, w)), el("span", { part: "tile", state: "moved", lang: "nl" }, "komt"))],
      ["your typing against the answer", ui.typeDiff("gat", "gaat")],
    ]),
    states("Gaps and matches", [
      ["empty", el("span", { part: "blank", state: "empty" }, "____")],
      ["right", el("span", { part: "blank", state: "right", lang: "nl" }, "bel")],
      ["wrong", el("span", { part: "blank", state: "wrong", lang: "nl" }, "belt")],
      ["filled", el("span", { part: "blank", state: "filled", lang: "nl" }, "bel")],
      ["selected", el("button", { part: "match-item", state: "selected", type: "button", lang: "nl" }, "boek")],
      ["matched", el("button", { part: "match-item", state: "matched", type: "button", lang: "nl" }, "boek")],
      ["wrong", el("button", { part: "match-item", state: "wrong", type: "button", lang: "nl" }, "boek")],
    ]),
  );
}

/**
 * Tinta's states, as its rig has them: the held ones loop (idle, loading, and the ones drafted on the rig, like
 * lex-retention's lounge or sleepy), the reactions play once. Read from the states themselves, as character.js does.
 */
function characterStates() {
  const rig = tinta({ size: 72 });
  // Its own first (idle, loading, right, wrong, heart), then the drafted ones in the rig's order.
  const names = [...RIG_STATES, ...Object.keys(rig).filter((name) => !RIG_STATES.includes(name))].filter((name) => typeof rig[name]?.frame === "function");
  return {
    held: names.filter((name) => rig[name].loop === true),
    reactions: names.filter((name) => !rig[name].loop && Number.isFinite(rig[name].dur)),
  };
}

/** Word pictures and symbols: our own drawings, colored by the art tokens, in color or the theme's ink (data-art="theme"). */
function artSection() {
  const WORDS = ["coffee", "water", "tea", "milk", "dog", "key"];
  const tiles = el("div", { class: "ds-art-tiles" });
  const lay = () => tiles.replaceChildren(...WORDS.map((word) => pictureNode(word)));
  lay();
  loadPictures(WORDS).then(lay);
  const symbols = el("div", { class: "ds-art-symbols" }, ...SYMBOL_NAMES.map((name) => symbol(name, { size: 40 })));
  const both = el("div", {}, tiles, symbols);
  const ink = ui.button("The theme's ink", { variant: "fade", size: "sm", onclick: () => (both.hasAttribute("data-art") ? both.removeAttribute("data-art") : both.setAttribute("data-art", "theme")) });
  return section(
    "art",
    "Word pictures and symbols",
    "Drawn by us and colored by the art tokens: in color by default, in the theme's own ink with data-art=\"theme\" on the page or any part of it. A word picture comes with its tile, sized by what holds it (study/pictures.js); a symbol is its own size (lx/symbols.js); a quiet one takes the color of what holds it.",
    demo("A word picture (the part picture), then every symbol at 40 px", both, ink),
  );
}

/** Tinta's acts in the app: each one (character/rig/splat/acts.js, run by the part's perform), live. */
function tintaActsSection() {
  return section(
    "tinta-acts",
    "Tinta's acts in the app",
    "Where the app does something, Tinta acts it out: decoration on a screen that's already done. A press ends whatever it's doing, and with animations off nothing moves.",
    ...downloadDemos(),
    retryDemo(),
    stampDemo(),
    planeDemo(),
  );
}

/** The paper plane: shared (it folds, flies off, round and back) and an answer arriving (a plane in, unfolding). */
function planeDemo() {
  const tinta = ui.character({ size: 36, hidden: true });
  return demo(
    "The paper plane (ui.planeCharacter): a pack shared, Tinta folds into a paper plane of ink and flies off, round and back; an answer to your request, a plane glides in and unfolds into Tinta",
    el(
      "div",
      { class: "ds-plane" },
      ui.pinnedActions([tinta, ui.button("Shared", { size: "lg", onclick: () => ui.planeCharacter(tinta, "off") }), ui.button("An answer", { size: "lg", onclick: () => ui.planeCharacter(tinta, "in") })]),
    ),
  );
}

/** Me too: Tinta at the start of a page's actions throws its drop onto the button as a seal (press Me too). */
function stampDemo() {
  const tinta = ui.character({ size: 36, hidden: true });
  let count = 14;
  const meToo = ui.button(`Me too · ${count}`, { size: "lg", pressed: "false" });
  meToo.addEventListener("click", () => {
    const on = meToo.getAttribute("aria-pressed") !== "true";
    count += on ? 1 : -1;
    meToo.setAttribute("aria-pressed", String(on));
    meToo.textContent = `Me too · ${count}`;
    if (on) ui.stampCharacter(tinta, meToo);
  });
  return demo(
    "Me too (ui.stampCharacter): it counts at once, and Tinta's thrown drop lands on the button as a seal, holds, and dries away; taking it back throws nothing",
    el("div", { class: "ds-stamp" }, ui.pinnedActions([tinta, meToo, ui.button("Answer", { variant: "white", size: "lg", icon: "plus" })])),
  );
}

/** Something that didn't go: Send fails the first time (as with no connection); Retry sends it again, and it goes. */
function retryDemo() {
  const line = ui.askStatus();
  let tries = 0;
  const send = async () => {
    tries++;
    await new Promise((r) => setTimeout(r, 300));
    if (tries % 2) return line.fail("Couldn't reach Lexicommons, so it wasn't sent. Try again when you're online.", send);
    line.say("right", "Sent to your AI. The answer comes back on the AI tab.");
  };
  return demo(
    "Something that didn't go (ui.retryLine, askStatus().fail): the app's words, Retry (never disabled; it does the same again), and Tinta beside them: it slumps into a puddle, peeks at Retry, and pulls itself back up. Press Send: it fails the first time",
    el("div", { class: "lx-stack ds-retry" }, el("div", { class: "lx-row" }, ui.button("Send", { onclick: send })), line),
    el("p", { class: "lx-small lx-muted" }, "As it stands, Tinta still:"),
    el("p", { part: "ask-status", "data-meaning": "wrong" }, ui.retryLine("Lexicommons couldn't be reached. Try again in a moment.", () => {}, { still: true })),
  );
}

/** A download's bar: a sample download (3 s, unevenly, as a real one comes in) and Stop; and its states, still. */
function downloadDemos() {
  const slot = el("div", { class: "ds-download-slot" }, ui.downloadBar({ label: "A sample download", still: true }));
  let timer = 0;
  let bar = null;
  // Fast, a stall, fast again, slower at the end.
  const PACE = [[0, 0], [0.6, 0.24], [1.0, 0.31], [1.6, 0.58], [2.5, 0.93], [3.0, 1]];
  const start = () => {
    clearInterval(timer);
    bar = ui.downloadBar({ label: "A sample download" });
    slot.replaceChildren(bar);
    const t0 = performance.now();
    timer = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const k = PACE.findIndex(([at]) => at > t);
      const share = k < 0 ? 1 : PACE[k - 1][1] + (PACE[k][1] - PACE[k - 1][1]) * ((t - PACE[k - 1][0]) / (PACE[k][0] - PACE[k - 1][0]));
      bar.set(share);
      if (share >= 1) clearInterval(timer);
    }, 50);
  };
  const stop = () => {
    clearInterval(timer);
    bar?.stop();
  };
  const finished = ui.downloadBar({ label: "Done", still: true });
  finished.done();
  const stopped = ui.downloadBar({ label: "Stopped", share: 0.6, still: true });
  stopped.stop();
  return [
    demo(
      "A download (ui.downloadBar): Tinta pours itself into the bar and is its fill, its eyes on the front; at the end it comes out of the far end and hops. The bar's own fill shows the progress whatever Tinta does: press anywhere mid-way",
      el(
        "div",
        { class: "lx-stack ds-download" },
        slot,
        el("div", { class: "lx-row" }, ui.button("Download", { onclick: start }), ui.button("Stop", { variant: "fade", onclick: stop })),
        el("p", { class: "lx-small lx-muted ds-download-note" }, "A sample: 3 seconds, unevenly, as a real download comes in."),
      ),
    ),
    states("Its states, with Tinta still", [
      ["not started", ui.downloadBar({ label: "Not started", still: true })],
      ["40%", ui.downloadBar({ label: "40%", share: 0.4, still: true })],
      ["done", finished],
      ["stopped", stopped],
      ["plain, no Tinta (a book opening)", ui.downloadBar({ label: "A book opening", share: 0.5, still: true, tinta: false })],
    ]),
  ];
}

/** A card with only its title, for Tinta's peek over its top edge: no screen draws peek now (the quick session's card it was made for is gone), so its
 * card is this page's own (design.css .ds-peek-card). */
const peekCard = (tinta) => el("section", { class: "ds-peek-card", "aria-label": "A card" }, tinta, el("h2", {}, "A card"));

/** Tinta, the character: its states, its reactions (played on a press of their buttons), its sizes, and its stills. */
function characterSection() {
  const { held, reactions } = characterStates();
  const stage = ui.character({ size: 120, hidden: true });
  const label = (name) => name[0].toUpperCase() + name.slice(1);
  const play = (name) => ui.button(label(name), { variant: "fade", size: "sm", onclick: () => ui.playCharacter(stage, name) });
  return section(
    "character",
    "Tinta",
    "Lexicommons' character: an ink drop that's always liquid, drawn live from its rig (public/js/character/). It's decoration: it takes no presses, nothing waits for it, and a press finishes whatever it's doing. With animations off it holds a still for each state.",
    states(
      "Its held states, each looping: idle, loading, and the ones drafted on the rig for their places (lex-retention's: Home's calm days, a paused reminder, the empty states)",
      // Peek sits behind a card's top edge (the rig clips it there): shown on a quick session's card, as Study has it.
      held.map((name) => [name, name === "peek" ? peekCard(ui.character({ state: name, size: 56, hidden: true })) : ui.character({ state: name, size: 96, hidden: true })]),
    ),
    demo(
      "Its reactions: each plays once, then it's idle again (a press anywhere finishes one)",
      el("div", { class: "lx-row ds-character-stage" }, stage, el("div", { class: "lx-row" }, reactions.map(play))),
    ),
    speakingDemo(),
    watchingDemo(),
    pointingDemo(),
    states("Sizes: 24 (inline), 48, 72 (a card's corner), 160 (a screen of its own)", [24, 48, 72, 160].map((size) => [`${size} px`, ui.character({ size, hidden: true })])),
    states(
      "With animations off: a still for each state, never a frozen moment",
      [...held, ...reactions].map((name) => {
        const node = ui.character({ state: held.includes(name) ? name : "idle", size: name === "peek" ? 56 : 72, still: true, hidden: true });
        if (!held.includes(name)) ui.playCharacter(node, name);
        return [name, name === "peek" ? peekCard(node) : node];
      }),
    ),
  );
}

/**
 * Tinta speaking: a Tinta that speaks says what the app says. The same sentence two ways, through study/voice.js as the
 * app plays it: a recording (its words' times from the manifest, the mouth opened by the file's loudness) and this
 * device's voice (its words' times estimated, put right at each word boundary it reports).
 */
function speakingDemo() {
  const speaker = ui.character({ size: 120, hidden: true, speaks: true });
  speaker.classList.add("ds-character-speaker");
  const item = itemById.get("morgen-oma");
  const buttons = el("div", { class: "lx-row" });
  const render = () => {
    // The starter's first recorded voice, and this device's first voice for the language.
    const recorded = voice.packVoices()[0];
    const device = voice.voiceChoices()[0];
    const say = (kind, choice, label) => el("span", { class: "lx-row ds-say", "data-say": kind }, ui.speakButton((options) => voice.speakItem(item, { ...options, choice }), { label }), el("span", { class: "lx-small" }, label));
    buttons.replaceChildren(...[recorded && say("recording", `rec:${recorded.slug}`, `A recording (${recorded.name})`), device && say("device", device.id, "This device's voice")].filter(Boolean));
  };
  voice.onVoicesChange(render);
  voice.loadAudio().then(render);
  render();
  return demo(
    "Speaking: one that speaks (speaks: true) says what the app says, its mouth on the words while the sound plays; a press that stops the sound closes it, and with animations off it holds its still",
    el("div", { class: "lx-row ds-character-speaking" }, speaker, buttons),
  );
}

/** Tinta's eyes on what you touch: watch(container) follows the control you press or focus, and your finger as it drags. */
function watchingDemo() {
  const watcher = ui.character({ size: 96, hidden: true });
  watcher.classList.add("ds-character-watcher");
  const tiles = el("div", { class: "lx-stack ds-character-tiles" }, ["boek", "lezen", "morgen"].map((word) => el("button", { part: "tile", type: "button", lang: "nl" }, word)));
  customElements.whenDefined("lx-tinta").then(() => watcher.watch(tiles));
  return demo("Its eyes follow what you touch (watch): the tile you press, your finger as it drags; 2.5 s later they're its own again", el("div", { class: "lx-row ds-character-watching" }, watcher, tiles));
}

/** Tinta pointing at a hint's clues (pointAt): each marked word in turn, ringed while it points, never an answer. */
function pointingDemo() {
  const pointer = ui.character({ size: 64, hidden: true });
  const line = ui.literalLine(CARDS[0]);
  const point = ui.button("Point at the clues", { variant: "fade", size: "sm", onclick: () => ui.pointCharacter(pointer, line.querySelectorAll('[data-part="literal-chunk"][data-state="moved"]')) });
  requestAnimationFrame(() => line.lxSetOrder?.("dutch"));
  return demo("A hint: it points its curl at each word the hint marks (the clue), ringed while it does, then looks back at you; never at an answer", el("div", { class: "lx-row ds-character-pointing" }, line, pointer, point));
}

function motionSection() {
  // The rule, live: a tile takes a deliberately slow three seconds to fly across. Press where it's going and you press
  // it at once (the real tile is already there; only its drawing travels).
  const slots = [el("div", { class: "ds-slot" }), el("div", { class: "ds-slot" })];
  let presses = 0;
  const count = el("span", { class: "lx-small lx-muted" }, "Pressed 0 times");
  const tile = el("button", { part: "tile", type: "button", lang: "nl" }, "morgen");
  tile.addEventListener("click", () => {
    const from = tile.getBoundingClientRect();
    const next = tile.parentElement === slots[0] ? slots[1] : slots[0];
    next.append(tile);
    presses++;
    count.textContent = `Pressed ${presses} ${presses === 1 ? "time" : "times"}`;
    motion.fly(tile, from, { duration: 3000, arc: 30 });
  });
  slots[0].append(tile);
  const morphCard = ui.studyCard(CARDS[0]);
  return section(
    "motion",
    "Motion",
    "Clean and quick, and never in the way. Animations are drawn over a page that has already changed, so they can't block anything: anything that moves is drawn by a copy the pointer passes through while the real thing already sits where it's going, any tap or key finishes every animation at once, and nothing waits for one to end. Settings → Animations turns them off entirely.",
    el(
      "ul",
      { class: "ds-rules lx-small" },
      el("li", {}, "State and layout change first, instantly; animation only draws the change."),
      el("li", {}, "Things you can press never move under the pointer: press where something is going and you press it."),
      el("li", {}, "Pressable things appear by fading and sharpening, never by sliding or growing."),
      el("li", {}, "Any tap or key finishes everything still moving."),
      el("li", {}, "Animations off (or a device set to reduce motion, when following the device): nothing animates at all."),
    ),
    demo("Press where it's going: this flight takes 3 seconds, the tile is already at its end", el("div", { class: "ds-slots" }, slots), count),
    demo(
      "The Dutch-order morph",
      morphCard,
      el("div", { class: "lx-row" }, ui.button("Play it again", { variant: "gray", size: "sm", icon: "refresh", onclick: () => morphCard.lxLiteral.lxMorph() })),
    ),
  );
}

function sessionSection() {
  const frame = el("div", { class: "ds-session-frame" });
  const bar = ui.sessionBar({ states: ["right", "wrong", "right", "current", "upcoming", "upcoming", "upcoming", "upcoming"], step: "4/8" });
  const choices = ui.choiceList(["Morgen we gaan naar oma.", "Morgen gaan we naar oma.", "We morgen gaan naar oma."], 1);
  const activity = el("main", { part: "activity" }, ui.activityPrompt("Which is right?", "Tomorrow we're going to Grandma's."), choices);
  const fb = ui.feedback("right", "Right", "Verb second. In a main clause the verb comes second.");
  const answer = ui.answerBar(fb, el("div", { class: "lx-answer-actions" }, ui.button("Continue", { variant: "white", size: "lg", block: true })));
  answer.setAttribute("data-meaning", "right");
  frame.append(el("div", { part: "session" }, bar, activity, answer));
  requestAnimationFrame(() => choices.lxPick(1));
  const moved = [
    ["Verb second", "right", 2, 3, "3/3"],
    ["dat: verb to the end", "wrong", 2, 1, "1/2"],
    ["oma · grandma", "new", 0, 2, "1/1"],
    ["Haus · house; zu Hause: at home; von zu Hause: from home; nach Hause: home", "right", 1, 2, "2/2"],
  ].map(([name, meaning, from, to, tally]) =>
    el("div", { class: "lx-moved-row" }, el("div", {}, ui.conceptTag(name, meaning)), el("span", { class: "lx-tally" }, tally), ui.strengthMeter(to)),
  );
  const summary = el(
    "section",
    { part: "session-summary" },
    el("h2", {}, "Nicely done"),
    el("div", { class: "lx-stats" }, ...[["86%", "right"], ["8", "steps"], ["5", "minutes"]].map(([v, l]) => el("div", { class: "lx-stat" }, el("strong", {}, v), el("span", {}, l)))),
    el("div", { class: "lx-stack" }, el("h3", { class: "lx-h3" }, "What moved"), el("div", {}, moved)),
  );
  return section(
    "session",
    "Session",
    "Study opens with one card, the day's one thing; a session takes the whole screen, one step at a time, with what it asks on top, the game in the middle and the answer bar at the bottom. It ends with what moved.",
    demo(
      "Study's two doors: Practice, and a new lesson on a ticket",
      el(
        "div",
        { class: "lx-study-doors" },
        studyDoor({ door: "practice", art: "practice2", title: "Practice", sub: "What you know, mixed. About 5 min", href: "#session" }),
        studyDoor({ door: "lesson", art: "learn", title: "A new lesson", sub: "Go home with someone", href: "#session" }),
      ),
    ),
    demo("Where you are, drawn small", pathStrip({ here: 3, count: 20, place: "Lesson 4", href: "#session" })),
    demo("The way in after a question: a miss, and a right answer", el("div", { class: "lx-stack" }, chipRow([["p:v2", "Verb second"], ["c:dank-je", "dank je"]], { onOpen: () => {}, right: false }), chipRow([["p:v2", "Verb second"]], { onOpen: () => {}, right: true }))),
    demo(
      "A concept's sheet: your sentence drawn (the rule's words lit, its shape on them), why, more of yours, and all of it inside the sheet",
      conceptBody(
        {
          name: "Perfect tense: verb last",
          short: "With hebben or zijn, the form for the past, often starting with ge-, usually goes at the end of a simple sentence.",
          picture: "order",
          why: "Think of the verb as a pair of brackets. [[Heb]] or [[ben]] takes the verb's seat in second place, and the past form ([[gewerkt]], [[gelezen]]) closes the sentence at the very end, with everything else held in between.",
          explain: "Use a form of hebben or zijn and usually put the form for the past at the end. Most verbs use hebben; gaan and komen use zijn.",
          contrasts: [{ with: "English", says: "English keeps “have” and the next verb together." }],
          examples: [
            { text: "Ik heb gisteren gewerkt.", means: "I worked yesterday.", literal: "I have yesterday worked.", marks: [1, 3] },
            { text: "We zijn naar huis gegaan.", means: "We went home.", literal: "We are to home gone.", marks: [1, 4] },
            { text: "Heb je het boek gelezen?", means: "Did you read the book?", literal: "Have you the book read?", marks: [0, 4] },
          ],
          mistakes: [{ wrong: "Ik heb gelezen een boek.", right: "Ik heb een boek gelezen.", why: "The past form goes at the end." }],
        },
        {
          sentence: "Ik heb vandaag een boek gelezen.",
          means: "I read a book today.",
          literal: [["I"], ["have"], ["today"], ["a"], ["book"], ["read"]],
          marks: [5],
          roles: ["who does it", "helping verb", "time word", "introduces a noun", "what's being read", "main verb"],
          lemmas: ["ik", "hebben", "vandaag", "een", "boek", "lezen"],
          wordNotes: [{ word: "gelezen.", why: "With heb, gelezen goes to the end.", differs: "English keeps have and read together." }],
          more: [
            { text: "Ik heb gisteren gewerkt.", means: "I worked yesterday.", marks: [3] },
            { text: "We zijn naar huis gegaan.", means: "We went home.", marks: [4] },
          ],
          level: 2,
          right: 4,
          wrong: 1,
        },
      ),
    ),
    demo(
      "A rule's picture in any language: the marks a pack gives a sentence (item.shapes), drawn as given, in Spanish, Japanese (no spaces) and Arabic (right to left)",
      el(
        "div",
        { part: "concept-sheet", class: "lx-stack" },
        ...[
          // Spanish: the verb's ending says who; an article with its noun; a past ending.
          { lang: "es", words: ["Yo", "hablo", "español."], lemmas: ["yo", "hablar", "español"], means: "I speak Spanish.", shapes: [{ shape: "lit", words: [1] }, { shape: "affix", word: 1, chars: [[4, 5]] }, { shape: "link", from: 0, to: 1, toChars: [4, 5], note: "The -o is for yo: hablo, I speak." }] },
          { lang: "es", words: ["La", "casa", "es", "grande."], means: "The house is big.", shapes: [{ shape: "lit", words: [0] }, { shape: "box", from: 0, to: 1, note: "Casa takes la: la casa, the house." }] },
          { lang: "es", words: ["Ellos", "comieron", "pan."], lemmas: ["ellos", "comer", "pan"], means: "They ate bread.", shapes: [{ shape: "lit", words: [1] }, { shape: "affix", word: 1, chars: [[3, 8]] }, { shape: "link", from: 0, to: 1, toChars: [3, 8] }] },
          // Japanese, written without spaces: what each particle does, over it; a past ending.
          { lang: "ja", separator: "", words: ["私", "は", "学生", "です。"], means: "I am a student.", shapes: [{ shape: "lit", words: [1] }, { shape: "tag", word: 1, text: "topic", note: "は marks what the sentence is about." }] },
          { lang: "ja", separator: "", words: ["猫", "が", "魚", "を", "食べた。"], lemmas: ["猫", null, "魚", null, "食べる"], means: "The cat ate the fish.", shapes: [{ shape: "lit", words: [1, 3] }, { shape: "tag", word: 1, text: "subject" }, { shape: "tag", word: 3, text: "object" }, { shape: "affix", word: 4, chars: [[2, 3]] }] },
          // Arabic, right to left: the article al- joined to its noun; a verb's prefix and suffix together.
          { lang: "ar", dir: "rtl", words: ["ذهب", "الولد", "إلى", "المدرسة."], means: "The boy went to school.", shapes: [{ shape: "affix", word: 1, chars: [[0, 2]] }, { shape: "affix", word: 3, chars: [[0, 2]] }, { shape: "link", from: 0, to: 1, note: "Al- makes a word definite: al-walad, the boy." }] },
          { lang: "ar", dir: "rtl", words: ["هم", "يكتبون."], lemmas: ["هم", "كتب"], means: "They write.", shapes: [{ shape: "lit", words: [1] }, { shape: "affix", word: 1, chars: [[0, 1], [4, 6]] }, { shape: "link", from: 0, to: 1, note: "Ya- … -ūn: they, doing it now." }] },
        ].map(({ lang, ...one }) => rulePicture({ ...one, lang }).node),
      ),
    ),
    demo(
      "A session's tally, on a till receipt",
      (() => {
        const tally = el("div", { part: "session-tally" }, el("div", { class: "lx-stats" }, el("div", { class: "lx-stat" }, el("strong", {}, "100%"), el("span", {}, "right")), el("div", { class: "lx-stat" }, el("strong", {}, "3"), el("span", {}, "steps"))));
        edge(tally, "receipt");
        return tally;
      })(),
    ),
    demo(
      "Which one is it? Pictures with their words: each fills its card, and right or wrong is the card's edge and mark",
      (() => {
        const drinks = ["coffee", "tea", "water", "milk"];
        const choices = () => ui.pictureChoices(drinks.map((id) => ({ label: `the ${id}`, picture: pictureNode(id) })), 0);
        const holder = el("div", {}, choices());
        loadPictures(drinks).then(() => holder.replaceChildren(choices()));
        return holder;
      })(),
    ),
    demo("Which one is it? No drawings: their words, in the same place", ui.pictureChoices([{ label: "the coffee" }, { label: "the tea" }, { label: "and" }, { label: "I" }], 0)),
    demo("A question's tag: it's new, or it's come back", el("div", { class: "lx-row" }, el("span", { part: "step-tag" }, "New word"), el("span", { part: "step-tag" }, "Once more"))),
    demo("A sentence to say in English", el("div", { part: "translate-line" }, ui.speakButton(() => null, { label: "Play the sentence" }), ui.targetLine([{ text: "Ik" }, { text: "drink", state: "target" }, { text: "koffie." }], { lang: "nl" }))),
    demo("A word on its question", el("div", { part: "see-word" }, ui.speakButton(() => null, { label: "Say it" }), el("span", { lang: "nl" }, "de koffie"))),
    demo("A step, answered", frame),
    demo("The end of a session", summary),
  );
}

function settingsSection() {
  const page = el(
    "div",
    { class: "ds-settings-demo" },
    el("header", { part: "app-header" }, ui.backButton({ part: "app-back", href: "#settings-demo", label: "Settings" })),
    ui.pageTitle("Study cards", "A page inside Settings: a back link, a large title, then groups of rows."),
    ui.group("The Dutch-order line", [
      ui.switchRow({ title: "Show the Dutch-order line", sub: "The English words in Dutch order", checked: true }),
      ui.choiceRow({ title: "When the meaning shows", options: [["slide", "Slides into Dutch order"], ["dutch", "In Dutch order"], ["english", "In English order"]], value: "slide" }),
    ], "A note under a group says what its settings do."),
    ui.group("Packs", [
      ui.switchLinkRow({ icon: "cards", title: "Starter: Dutch word order", sub: "13 sentences · Lexicommons", href: "#settings-demo", checked: true }),
      ui.switchLinkRow({ icon: "cards", title: "A trip to Amsterdam", sub: "40 sentences · made by your AI", href: "#settings-demo", checked: false }),
    ], "A row that opens its own page, with a switch beside it: the text opens, the switch turns it on or off."),
    ui.group(null, [
      ui.listRow({ icon: "palette", title: "Appearance", value: "Graphite", href: "#settings-demo" }),
      ui.listRow({ icon: "trash", title: "Delete my account", variant: "danger", trailing: el("span"), onclick: () => {} }),
    ]),
  );
  for (const link of page.querySelectorAll("a[href='#settings-demo']")) link.addEventListener("click", (event) => event.preventDefault());
  return section(
    "settings-demo",
    "Settings",
    "Settings is a menu of pages. Rows highlight as a whole, rounded, and only while pressed on a touch screen.",
    el("div", { class: "ds-grid" }, demo("A settings page", page), demo(
      "The menu's profile row, and picking a theme",
      el("ul", { part: "list" }, el("li", { class: "lx-row-item" }, el("a", { part: "list-row", href: "#settings-demo", class: "lx-profile-row" }, ui.avatar("Imaginative Prompting", { size: "lg" }), el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, "Imaginative Prompting"), el("span", { class: "lx-row-sub" }, "Account and passkeys")), icon("chevron")))),
      el("div", { class: "lx-swatches" }, ["graphite", "paper", "contrast", "sepia"].map((id, i) => ui.themeSwatch({ id, name: id[0].toUpperCase() + id.slice(1), selected: i === 0 }))),
      el("p", { class: "lx-small lx-muted" }, "Yours: a theme you or your AI made, drawn on its built-in theme with its own colors and background"),
      el("div", { class: "lx-swatches" }, ui.themeSwatch({ id: "demo-yours", name: "Harbor", selected: false, look: SAMPLE_THEME, imageUrl: SAMPLE_TILE }), ui.themeSwatch({ id: "demo-yours-plain", name: "Night shift", selected: true, look: SAMPLE_PLAIN_THEME })),
      el("div", { class: "lx-row" }, ui.avatar("Imaginative Prompting"), el("span", { class: "lx-small lx-muted" }, "An avatar, small and large")),
    ), demo(
      "Add to Home Screen: a device's steps, each button drawn as its glyph and name; Home's row, with Not now",
      installSteps(platformById("ios-safari")),
      installSteps(platformById("android-samsung")),
      el("ul", { part: "list" }, installRowNode({ href: "#settings-demo" })),
    )),
  );
}

// A theme of yours, for the theme swatch's "yours" variant: a light blue theme with a tiled background, and a plain one.
const SAMPLE_TILE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#f3f7fb"/><path d="M20 4 36 20 20 36 4 20Z" fill="none" stroke="#1f3f95" stroke-width="2"/><circle cx="20" cy="20" r="4" fill="#1f3f95"/></svg>')}`;
const SAMPLE_THEME = {
  name: "Harbor",
  base: "paper",
  tokens: { "--canvas": "#f3f7fb", "--well": "#ffffff", "--ink-1": "#13315c", "--ink-3": "#5b6b9f", "--m-right": "#0a7a9c", "--m-wrong": "#c2410c", "--m-moved-mark": "#e4d6f2", "--image-background-size": "200px", "--image-background-repeat": "repeat", "--image-background-dim": "70%" },
  css: "",
  images: {},
};
const SAMPLE_PLAIN_THEME = { name: "Night shift", base: "graphite", tokens: { "--canvas": "#14110e", "--well": "#1f1a15", "--ink-1": "#f3e9dc", "--m-right": "#6cb4ee" }, css: "", images: {} };

// A short text of our own, to show the reading screen with (two chapters, a scene break, an italic phrase).
const READER_DEMO_TEXT = `Chapter 1
The Bakery on the Corner

Every morning before the sun was up, Mila unlocked the bakery on the corner and switched on the ovens. The street was quiet. Only the cat from number nine watched her through the window, as it always did.

She liked this hour best. The bread did not need her yet, the radio played old songs, and for a while the whole town seemed to belong to her. On the board behind the counter she wrote:

Fresh bread every morning
Cake on Fridays
Closed when the cat says so

* * *

By seven the first customers came in, stamping the cold from their shoes. "The usual?" she asked, and Mr. Visser nodded, as he had nodded every morning for _eleven years_.

Chapter 2
A Letter

The letter came on a Tuesday, in a blue envelope with a stamp she had never seen before. Mila read it twice standing up, then once more sitting down.

"Dear Mila," it began, in her grandmother's careful hand.`;

function readerSection() {
  const lookup = el("div", { class: "ds-lookup" }, popover("de buurman"));
  const text = el("div", { part: "reader-text" }, ui.wovenParagraph(WOVEN, (seg) => lookup.replaceChildren(popover(seg.nl))));
  const book = parseText(READER_DEMO_TEXT, { title: "The Bakery on the Corner" });
  // The board's three lines are verse lines (a book from the library marks them so; a pasted text can't tell).
  for (const para of book.paras) if (/^(Fresh|Cake|Closed)$/.test(book.words[para.s])) para.k = "v";
  // Two reading screens, each in a phone-sized frame: the bars up with the settings open, and zen in chapter 2.
  const frame = (wide = false) => el("div", { class: wide ? "ds-reader-frame ds-reader-frame-wide" : "ds-reader-frame" });
  const up = frame();
  const zen = frame();
  const paged = frame();
  const spread = frame(true);
  const withBars = openReader(up, { book, word: 0, mode: "scroll" });
  withBars.showSheet("settings");
  openReader(zen, { book, word: book.paras[book.chapters[1].para].s, mode: "scroll" }).setZen(true);
  // Pages lays itself out once the frame is on the page (the reader measures its lines). A frame wider than tall (and
  // at least 700 px) shows two pages side by side, as a landscape or wide screen does.
  openReader(paged, { book, word: 0, mode: "pages" }).setZen(true);
  openReader(spread, { book, word: 0, mode: "pages" }).setZen(true);
  // Highlights: one with a note (its ✦ solid), one without (faint). A highlight's note open from its ✦, and the list
  // from the bar.
  const word = (w) => book.words.indexOf(w);
  const marks = [
    { start: word("switched"), end: word("switched") + 3, note: "Every morning, before anyone else is up." },
    { start: word("radio") - 1, end: word("radio") + 3 },
  ];
  const noted = frame();
  const listed = frame();
  // Pinched in: the page itself, twice as big, about a point on its first lines.
  const pinched = frame();
  const zoomedReader = openReader(pinched, { book, word: 0, mode: "pages" });
  zoomedReader.setZen(true);
  // Once its fonts are in and it's laid out (a layout after that would end the zoom, as a real one does).
  document.fonts.ready.then(() =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const r = pinched.getBoundingClientRect();
        zoomedReader.zoomTo(2, r.left + r.width * 0.3, r.top + r.height * 0.45);
      }),
    ),
  );
  // Search in Contents: every place, its words marked, its chapter under it.
  const searched = frame();
  openReader(searched, { book, word: 0, mode: "scroll" }).search("mila");
  openReader(noted, { book, word: marks[0].start, mode: "scroll", highlights: marks }).showSheet("note");
  openReader(listed, { book, word: 0, mode: "scroll", highlights: marks }).showSheet("highlights");
  // A woven text: a short one of ours, with about half its words known, so one sentence shows whole.
  const woven = frame();
  const sample = demoBook();
  const sampleWeave = demoWeave(sample);
  const wovenReader = openReader(woven, { book: sample, weave: sampleWeave, know: knownForShare(sampleWeave, 0.6), mode: "scroll" });
  wovenReader.setZen(true);
  // A word's card, and a sentence's: from the woven sample, a word you know and its sentence.
  const cardKnown = knownForShare(sampleWeave, 0.6);
  const cardWord = sampleWeave.sentences.flatMap((S) => S.t.map(([, lemma], k) => (lemma && cardKnown.has(lemma) ? S.s + k : -1))).find((i) => i >= 0);
  const wordCardFrame = frame();
  const sentenceCardFrame = frame();
  // The word's card has its meaning, as a layer's definitions give it (written here for the demo's "bakkerij").
  const bakery = sample.words.indexOf("bakery");
  const sampleDefinitions = {
    layer: { format: "lexicommons-definitions", v: 1, lang: "nl", in: "en", licence: "CC-BY-SA-4.0", credit: "Written for this page", entries: { bakkerij: { senses: [{ pos: "noun", def: "a bakery; a shop or place where bread and cakes are made and sold", example: ["De bakkerij gaat om zeven uur open.", "The bakery opens at seven o'clock."] }] } } },
  };
  openReader(wordCardFrame, { book: sample, weave: sampleWeave, know: cardKnown, mode: "scroll", definitions: sampleDefinitions }).card(bakery);
  openReader(sentenceCardFrame, { book: sample, weave: sampleWeave, know: cardKnown, mode: "scroll" }).card(cardWord, { whole: true });
  // Holding a word ("bread", still in English here), once the frame is on the page: the toolbar is placed by the word.
  // Two words on, faint, the handle a drag would land on.
  requestAnimationFrame(() => {
    const at = sample.words.indexOf("bread");
    wovenReader.select(at);
    showLanding(woven, at + 2);
  });
  return section(
    "reader",
    "Reader",
    "The reading screen opens over the Read tab: one chapter at a time, every word its own place in the text. The bars are visitors: a tap puts them away (zen), a tap at the top or bottom of the page brings them back, and the chevron does both. The settings rise from behind their button with no shade, and the text size keeps the word you were reading where it was. In pages (the default), the chapter is cut into whole-line pages that turn with a curl you can drag; on a landscape or wide screen they come two side by side. Hold words to highlight them or write a note: a ✦ in the margin opens a highlight's note, and the bar lists them all. Contents searches the whole text, and two fingers zoom the page itself.",
    el("div", { class: "ds-grid ds-reader-frames" }, demo("Bars up, settings open", up), demo("Zen, in chapter 2", zen), demo("Pages: drag the page to turn it, or tap its right side", paged), demo("Woven: the words you know in Dutch; tap one for its meaning, hold one to select it", woven), demo("A highlight's note, from its ✦ (a highlight with a note has a solid ✦)", noted), demo("Highlights and notes, from the bar: yours by chapter", listed), demo("Search in Contents: every place in the text, by chapter", searched), demo("Pinched in: two fingers zoom the page itself, one moves it", pinched), demo("A word's card: tap the held words, More on a word's meaning, or a word in Your words", wordCardFrame), demo("A sentence's card: hold more than a word, then tap it", sentenceCardFrame)),
    // Outside the grid, so it can be wider than a phone.
    demo("Pages on a landscape or wide screen: two side by side, turned together", spread),
    el("p", { class: "lx-muted ds-intro-text" }, "A diglot weave: English with Dutch woven in, more of it as you learn. Tapping a Dutch word shows its meaning and counts as a miss on that word. A flipped sentence is all Dutch, with its literal line underneath."),
    el("div", { class: "ds-woven" }, text, lookup),
    demo("A file dragged over the Read tab", el("div", { part: "read-drop" }, "Drop an EPUB or a text file to add it")),
    states("Woven words", [
      ["plain", el("button", { part: "woven-word", type: "button", lang: "nl" }, "de tuin")],
      ["new", el("button", { part: "woven-word", state: "new", type: "button", lang: "nl" }, "het raam")],
      ["looked up", el("button", { part: "woven-word", state: "looked-up", type: "button", lang: "nl" }, "de buurman")],
      ["just added, its English over it", el("span", { part: "woven-word", state: "new", lang: "nl", class: "ds-woven-gloss" }, el("ruby", {}, "brood", el("rt", { part: "reader-gloss" }, "bread")))],
      [
        "just added in Japanese: its reading over it, its English under it",
        el("span", { part: "woven-word", state: "new", lang: "ja", class: "ds-woven-gloss ds-reading-word" }, el("ruby", {}, el("ruby", {}, "角", el("rt", { part: "reading" }, "かど")), el("rt", { part: "reader-gloss", state: "under" }, "corner"))),
      ],
      ["a whole sentence's Dutch-order line, on tap", el("span", { part: "reader-text" }, "Ik heb het boek gelezen. ", el("button", { part: "reader-literal-toggle", type: "button", "aria-label": "Show the Dutch-order line", "aria-expanded": "false" }, icon("moved")))],
      ["suggested: a word to learn next, still English", el("span", { part: "reader-text" }, "She was ", el("span", { part: "reader-suggestion" }, "tired"), " of sitting there.")],
      [
        "a Dutch book with English help: over the words you don't know, a word you knew looked up",
        el("span", { part: "reader-text", lang: "nl" }, el("span", { part: "reader-word" }, el("ruby", {}, "Waarom", el("rt", { part: "reader-gloss", lang: "en" }, "why"))), " ", el("span", { part: "reader-word" }, "heb"), " ", el("span", { part: "reader-word", state: "looked-up" }, "jij"), " ", el("span", { part: "reader-word" }, el("ruby", {}, "huiswerk", el("rt", { part: "reader-gloss", lang: "en" }, "homework")))),
      ],
      ["its help in place: the English in Dutch order", el("span", { part: "reader-text" }, el("span", { part: "reader-help", lang: "en" }, "Why"), " heb jij je ", el("span", { part: "reader-help", lang: "en" }, "homework"), " niet ", el("span", { part: "reader-help", lang: "en" }, "made"), "?")],
    ]),
    demo("A picture book's page: its picture over its text", pictureBookDemo()),
    demo(
      "Words you already know: tap the ones you know, × passes one over (known: as it goes)",
      el("div", { part: "known-grid", class: "ds-known-grid" }, ...["zij", "zijn", "het", "een", "de", "en"].map((lemma, k) => knownWordCell(lemma, { lang: "nl", state: k === 1 ? "known" : undefined }))),
    ),
  );
}

function feedbackSection() {
  return section(
    "feedback",
    "Feedback",
    "What an answer tells you, in the same words and signals whatever you were doing.",
    el(
      "div",
      { class: "ds-grid" },
      ui.feedback("right", "Right", "Morgen gaan we: after “morgen”, the verb comes second."),
      ui.feedback("wrong", "Not quite", "After dat the verb goes to the end: …dat hij morgen komt."),
      ui.feedback("slipping", "Slipping", "gisteren last came up 9 days ago, so it'll be back sooner."),
      ui.feedback("hint", "Hint used", "Opening the literal line counts as a hint: this one comes back a little sooner."),
      ui.feedback("new", "New", "opbellen: to call someone. A separable verb: Ik bel je op."),
      ui.feedback("moved", "Moved", "The marked words are where Dutch puts them, not where English would."),
    ),
    demo("Notices", el("div", { class: "ds-states" }, ui.toast("right", "Saved to your storage"), ui.toast("wrong", "Couldn't reach your storage"), ui.toast("slipping", "8 concepts are slipping"))),
  );
}

function progressSection() {
  return section(
    "progress",
    "Progress",
    "Where you are in a session, and how well each concept is known (0 to 4, one ink in steps; color only for state).",
    demo("Session", ui.sessionProgress(["right", "right", "wrong", "right", "current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"])),
    states("Strength", [
      ["0", ui.strengthMeter(0)],
      ["1", ui.strengthMeter(1)],
      ["2", ui.strengthMeter(2)],
      ["3", ui.strengthMeter(3)],
      ["4", ui.strengthMeter(4)],
      ["3, slipping", ui.strengthMeter(3, "slipping")],
    ]),
    demo("Streak", el("span", { part: "streak" }, icon("flame"), "12 days")),
    states("A finished session's moment, Tinta above it (it hops when today counts, becomes a heart at a milestone)", [
      ["today counts", celebration({ counted: true, days: 12, from: 11, firstDay: false, mended: false, restEarned: false, milestone: null }, { sound: false })],
      ["day 1", celebration({ counted: true, days: 1, from: 0, firstDay: true, mended: false, restEarned: false, milestone: null }, { sound: false })],
      ["a milestone", celebration({ counted: true, days: 30, from: 29, firstDay: false, mended: false, restEarned: false, milestone: { kind: "days", n: 30 } }, { sound: false })],
      ["words", celebration({ counted: false, days: 30, from: 30, firstDay: false, mended: false, restEarned: false, milestone: { kind: "words", n: 500 } }, { sound: false })],
    ]),
    demo(
      "Reminders: the note when they've paused themselves (the ask after a first finished session is a step of the session: study/session.js finish)",
      el("div", { part: "reminder-ask", state: "paused" }, el("div", { class: "lx-ask-head" }, ui.character({ size: 56, hidden: true }), el("div", { class: "lx-ask-text" }, el("p", {}, "Reminders are paused because the last few went unanswered."))), ui.button("Turn them back on")),
    ),
  );
}

function shellSection() {
  const page = el(
    "div",
    { part: "page" },
    el(
      "section",
      { part: "section" },
      el("h3", { part: "section-title" }, "Next"),
      el(
        "div",
        { part: "card", class: "lx-stack" },
        el("div", { class: "lx-spread" }, el("strong", {}, "12 concepts to review"), el("span", { class: "lx-small lx-muted lx-mono" }, "~6 min")),
        ui.button("Start", { variant: "white", block: true, icon: "play" }),
      ),
    ),
    el(
      "section",
      { part: "section" },
      el("h3", { part: "section-title" }, "Slipping"),
      el(
        "ul",
        { part: "list" },
        [["gisteren", 2], ["de buurman", 1], ["dat: verb to the end", 3]].map(([text, level]) =>
          el("li", { part: "list-row" }, icon("clock"), el("span", { lang: "nl" }, text), ui.strengthMeter(level, "slipping")),
        ),
      ),
    ),
  );
  const app = el(
    "div",
    { part: "app" },
    ui.appHeader("Home", { initials: "IP", language: { code: "nl", name: "Dutch", href: "#design-shell" } }),
    page,
    ui.tabBar([["today", "Home", "sun"], ["study", "Study", "cards"], ["read", "Read", "book"], ["explore", "Explore", "compass"]], "today", { settings: ["settings", "Settings", "gear"] }),
  );
  for (const tab of app.querySelectorAll('[data-part="tab"]')) tab.addEventListener("click", (event) => event.preventDefault());
  return section(
    "shell",
    "App shell",
    "Four tabs (Home, Study, Read, Explore; a setting swaps Read for AI once one is connected) in a floating bar the content runs under, with settings behind the button at the top right, and beside it the language you're learning (its flag and code open Settings → Language). On a wide screen the tabs become a sidebar.",
    el("div", { class: "ds-phone" }, app),
    demo(
      "A page's bar: the way back, the page's title (a page with no large title of its own) and an admin's sample learner",
      ui.appHeader("", { back: { href: "#design-shell", label: "Home", title: "Translate" }, mark: sampleMark("Weeks in", () => {}) }),
    ),
  );
}

function controlsSection() {
  const textField = el("input", { part: "text-field", type: "text", placeholder: "Search your words", "aria-label": "Search" });
  const area = el("textarea", { part: "text-field", rows: 3, placeholder: "Paste a Dutch text to read" });
  const switchInput = el("input", { part: "switch", type: "checkbox", role: "switch", checked: true, id: "ds-switch" });
  return section(
    "controls",
    "Controls",
    null,
    demo(
      "Buttons",
      el(
        "div",
        { class: "ds-states" },
        ui.button("Start", { variant: "white" }),
        ui.button("Later", { variant: "gray" }),
        ui.button("Skip", { variant: "fade" }),
        ui.button("Delete", { variant: "danger" }),
        ui.button("Listen", { variant: "gray", icon: "speaker" }),
        el("button", { part: "button", variant: "gray", type: "button", disabled: true }, "Disabled"),
      ),
    ),
    demo(
      "The way forward: one on a view (go), and the same action with nothing pushing it (calm)",
      el("div", { class: "lx-stack" }, ui.button("Start", { variant: "go", size: "lg", block: true }), ui.button("Practice again", { variant: "calm", size: "lg", block: true })),
    ),
    demo("Sizes", el("div", { class: "ds-states" }, ui.button("Small", { size: "sm" }), ui.button("Default"), ui.button("Large", { size: "lg", variant: "white" }))),
    demo("Icon buttons", el("div", { class: "ds-states" }, ui.iconButton("speaker", "Play audio"), ui.iconButton("speaker", "Playing", { state: "playing" }), ui.iconButton("gear", "Settings"), ui.iconButton("eye", "Show"))),
    demo(
      "Ways to sign in: Google's keeps its own G and colors (light or dark with the theme)",
      el(
        "div",
        { class: "lx-stack ds-sign-in" },
        ui.signInButton("google"),
        ui.signInButton("github"),
        ui.signInButton("passkey"),
        ui.signInButton("passkey", { label: "Passkeys aren't available here", disabled: true }),
      ),
    ),
    demo(
      "Fields",
      el(
        "div",
        { class: "lx-stack" },
        el("label", { part: "field" }, el("span", {}, "Search"), textField),
        el("label", { part: "field" }, el("span", {}, "A text to read"), area),
        el("label", { class: "lx-row" }, switchInput, el("span", {}, "Speak each new word")),
      ),
    ),
    demo("Segmented", ui.segmented([["day", "Day"], ["week", "Week"], ["month", "Month"]], "week", () => {}, "Range")),
    demo("Sub-navigation", ui.subnav([["#controls", "Account"], ["#tokens", "Appearance"], ["#surface", "Your AI"], ["#session", "Your data"]], "#controls")),
  );
}

function surfacesSection() {
  return section(
    "surfaces",
    "Surfaces",
    null,
    el(
      "div",
      { class: "ds-grid" },
      demo("Card", el("div", { part: "card" }, el("strong", {}, "Chapter 3"), el("p", { class: "lx-small lx-muted" }, "You'd understand about 82% of it."))),
      demo(
        "List",
        el(
          "ul",
          { part: "list" },
          el("li", { part: "list-row" }, icon("book"), el("span", {}, "De Ontdekking van de Hemel"), icon("chevron")),
          el("li", { part: "list-row" }, icon("chat"), el("span", {}, "Practice ordering at a café"), icon("chevron")),
          el("li", { part: "list-row" }, icon("ear"), el("span", {}, "Listening: at the station"), icon("chevron")),
        ),
      ),
      demo(
        "Rows that open things",
        el(
          "ul",
          { part: "list" },
          ui.listRow({ icon: "check", title: "Choose", sub: "Pick the right Dutch order", href: "#games" }),
          ui.listRow({ icon: "mic", title: "Repeat after", sub: "Needs audio from your AI", state: "soon", trailing: el("span", { part: "badge" }, "Soon") }),
        ),
      ),
      demo(
        "Empty states (ui.emptyState): Tinta above the words in a pose for them, never one pose everywhere. Nothing due: it lounges in a puddle of itself; kept here once you do something: it writes on a page; nothing here yet: it looks into an empty box; that isn't here: it looks round and shrugs; everything off: by a little switch, off; offline: it dozes under a cloud",
        el(
          "div",
          { class: "lx-stack" },
          ui.emptyState("Nothing is due yet. Come back later, or start a quick session.", { pose: "lounge" }),
          ui.emptyState("Practices you finish are kept here, on this device.", { pose: "page" }),
          ui.emptyState("No Dutch pack on this device yet. Find one in Explore, or ask your AI to make one.", { pose: "box" }),
          ui.emptyState("That practice isn't on this device.", { pose: "shrug" }),
          ui.emptyState("Every pack is off, so there's nothing to study. Turn one on, find one in Explore, or ask your AI to make one.", { pose: "off" }),
          ui.emptyState("Explore needs a connection. It'll be here when you're back online.", { pose: "doze" }),
        ),
      ),
      demo("Loading (ui.loadingState): Tinta writes loops of ink above the words, shown once the wait has lasted 0.4 s", ui.loadingState("Loading the open books…")),
      demo(
        "Looking it up (ui.lookingUp, Translate's wait): Tinta beside the words with its magnifier, 40 px; smaller (32) beside a line that's secondary",
        el("div", { class: "lx-stack" }, ui.lookingUp(), ui.lookingUp("Looking online too…", { size: 32 })),
      ),
      demo(
        "Skeleton: a place held for what's on its way, as tall as it was last time (a card, a row of covers), pulsing slowly; still when animations are off",
        el("div", { class: "lx-stack" }, ui.skeleton({ height: 180 }), ui.skeleton({ height: 64 })),
      ),
      demo("Sheet: drag its handle down to close it; pulled up, it gives and springs back", sheetDemo()),
    ),
  );
}

// A picture book's page as the reader lays it out (a drawn picture, so the page needs nothing from the library), and
// the credits at the end of the book.
function pictureBookDemo() {
  const picture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 190"><rect width="400" height="190" fill="#6b8fb5"/><circle cx="320" cy="50" r="26" fill="#f2d16b"/><path d="M0 150 Q100 110 200 150 T400 140 V190 H0Z" fill="#4c7a4f"/><rect x="150" y="80" width="14" height="70" fill="#7a5537"/><circle cx="157" cy="70" r="36" fill="#3f6b42"/><circle cx="178" cy="62" r="7" fill="#e8a04c"/></svg>')}`;
  return el(
    "div",
    { part: "reader-text", class: "ds-picture-page", lang: "nl" },
    el("figure", { part: "reader-picture" }, el("img", { src: picture, alt: "A cat in a tree", width: 400, height: 190 })),
    el("p", {}, "Waarom heb jij je huiswerk niet gemaakt?"),
    el("section", { part: "reader-credits", "aria-label": "About this book" }, el("h2", {}, "About this book"), el("p", {}, "A made-up page for this demo, under CC BY 4.0."), el("p", {}, el("span", { class: "lx-muted" }, "Pictures: "), "drawn for this page")),
  );
}

// A sheet in a phone-sized frame, to drag: down past a quarter (or a flick) slides it away, short of that it springs
// back.
function sheetDemo() {
  const frame = el("div", { class: "ds-sheet-frame" });
  const reopen = ui.button("Open the sheet", { variant: "gray", size: "sm" });
  reopen.hidden = true;
  const panel = ui.sheet({
    label: "Make more like this",
    hidden: false,
    onClose: (options) => panel.lxHide({ ...options, onHidden: () => (reopen.hidden = false) }),
  });
  panel.lxBody.append(
    el("strong", {}, "Make more like this"),
    el("p", { class: "lx-small lx-muted" }, "Your AI will write 20 new sentences using dat and verb-last."),
    ui.button("Add to my AI's list", { variant: "white", block: true }),
  );
  reopen.addEventListener("click", () => {
    reopen.hidden = true;
    panel.lxShow();
  });
  frame.append(reopen, panel);
  return frame;
}

function tokensSection() {
  const swatches = COLOUR_GROUPS.map(([group, names]) =>
    demo(
      group,
      el(
        "div",
        { class: "ds-swatches" },
        names.map((name) =>
          el("div", { class: "ds-swatch" }, withVar(el("i"), "--swatch", `var(${name})`), el("code", { class: "lx-tiny" }, name), el("span", { class: "lx-tiny lx-muted ds-value", "data-token": name })),
        ),
      ),
    ),
  );
  const typeRows = [
    ["Heading", "--size-28", "--type-head", "Lexicommons"],
    ["Title", "--size-20", "--type-head", "Study"],
    ["Body", "--size-16", "--type-ui", "12 concepts to review"],
    ["Small", "--size-14", "--type-ui", "Your AI made 20 new sentences"],
    ["Tiny", "--size-12", "--type-ui", "LAST SEEN 9 DAYS AGO"],
    ["Numbers", "--size-14", "--type-mono", "812 / 1,000 · 74%"],
    ["Reading", "--size-read", "--type-read", "She opened het raam."],
    ["Studied sentence", "--size-target", "--type-read", "Ik heb gisteren een boek gelezen."],
  ].map(([label, size, font, sample]) =>
    el(
      "div",
      { class: "ds-type-row" },
      el("div", { class: "lx-tiny lx-muted" }, label, el("br"), el("code", {}, `${size} · ${font}`)),
      withVar(withVar(el("div", { class: "ds-type-sample" }, sample), "--sample-size", `var(${size})`), "--sample-font", `var(${font})`),
    ),
  );
  const radii = ["--radius-8", "--radius-12", "--radius-16", "--radius-24", "--radius-full"].map((name) =>
    el("figure", { class: "ds-state" }, withVar(el("div", { class: "ds-radius" }), "--sample-radius", `var(${name})`), el("figcaption", { class: "lx-tiny lx-muted" }, name)),
  );
  const spaces = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    el("div", { class: "ds-space" }, el("code", { class: "lx-tiny" }, `--space-${n}`), withVar(el("i"), "--sample-space", `var(--space-${n})`), el("span", { class: "lx-tiny lx-muted ds-value", "data-measure": "" })),
  );
  const icons = ICON_NAMES.map((name) => el("figure", { class: "ds-icon" }, icon(name), el("figcaption", { class: "lx-tiny lx-muted" }, name)));
  return section(
    "tokens",
    "Tokens",
    "Every value is a CSS variable a theme can change. The values shown are the current ones, so they follow your theme and edits.",
    ...swatches,
    demo("Type", el("div", { class: "ds-type" }, typeRows)),
    demo("Radii", el("div", { class: "ds-states" }, radii)),
    demo("Space (scaled by the density preset)", el("div", { class: "ds-spaces" }, spaces)),
    demo("Icons (stroke only; each meaning has one)", el("div", { class: "ds-icons" }, icons)),
  );
}

function surfaceSection() {
  const result = el("div", { id: "surface-check" });
  const rows = PARTS.map((part) => {
    const extra = [
      part.states ? `data-state: ${part.states.join(" · ")}` : null,
      part.variants ? `data-variant: ${part.variants.join(" · ")}` : null,
      part.meanings ? "data-meaning" : null,
      part.levels ? "data-level: 0–4" : null,
    ].filter(Boolean);
    return el("tr", {}, el("td", {}, el("code", {}, part.name)), el("td", { class: "lx-muted" }, part.group), el("td", {}, part.about), el("td", { class: "lx-small" }, extra.join("; ")));
  });
  return section(
    "surface",
    "Theming surface",
    `What custom CSS and themes can rely on, version ${THEMING_SURFACE_VERSION}. Target these data-part names and their attributes, never class names. Renaming or removing one is a breaking change: the version goes up and the old name keeps working for a release. Your CSS always wins over the app's, so plain selectors work.`,
    result,
    demo(
      "Attributes",
      el("dl", { class: "ds-attrs" }, Object.entries(STATE_ATTRIBUTES).flatMap(([name, about]) => [el("dt", {}, el("code", {}, name)), el("dd", { class: "lx-small lx-muted" }, about)])),
    ),
    el(
      "div",
      { class: "ds-table-wrap" },
      el(
        "table",
        { class: "ds-table" },
        el("thead", {}, el("tr", {}, el("th", {}, "Part"), el("th", {}, "Group"), el("th", {}, "What it is"), el("th", {}, "Attributes"))),
        el("tbody", {}, rows),
      ),
    ),
  );
}

// The handle a drag lands on (reader-handle, state landing), held still for the demo: at the end of word i.
function showLanding(frame, i) {
  const text = frame.querySelector('[data-part="reader-text"]');
  const word = text?.querySelector(`[data-i="${i}"]:not([hidden])`);
  const landing = text?.querySelector('[data-part="reader-handle"][data-state="landing"]');
  if (!word?.getClientRects().length || !landing) return;
  const t = text.getBoundingClientRect();
  const rects = word.getClientRects();
  const r = rects[rects.length - 1];
  Object.assign(landing.style, { left: `${r.right - t.left + text.scrollLeft - 22}px`, top: `${r.top - t.top + text.scrollTop - 8}px`, height: `${r.height + 16}px` });
  landing.setAttribute("data-variant", "end");
  landing.hidden = false;
}

function renderSurfaceCheck() {
  const demos = checkSurface(document.getElementById("sections"));
  const whole = checkSurface(document);
  const target = document.getElementById("surface-check");
  const ok = demos.notShown.length === 0 && whole.notListed.length === 0 && demos.twice.length === 0;
  const lines = [];
  if (demos.notShown.length) lines.push(`Listed but not shown: ${demos.notShown.join(", ")}`);
  if (whole.notListed.length) lines.push(`On the page but not listed: ${whole.notListed.join(", ")}`);
  if (demos.twice.length) lines.push(`Listed twice: ${demos.twice.join(", ")}`);
  target.replaceChildren(
    ok
      ? ui.feedback("right", "This page passes", `All ${demos.listed} listed parts are shown here, and nothing unlisted appears.`)
      : ui.feedback("wrong", "This page doesn't match the theming surface", lines.join(" · ")),
  );
  return { ok, ...demos, notListed: whole.notListed };
}

function refreshValues() {
  // Every value read before any is written: written as each was read, each read restyled the whole page again (a theme change took
  // 3.5–4.6 s here, 3.3 s of it reading token values, 9 Nov 2026, and design-check's 5 s waits ran out).
  const tokens = [...document.querySelectorAll(".ds-value[data-token]")];
  // Space tokens are calc()s of the density preset: show what they come to, measured from the bar beside them.
  const measured = [...document.querySelectorAll(".ds-value[data-measure]")];
  const root = getComputedStyle(document.documentElement);
  const values = tokens.map((node) => root.getPropertyValue(node.dataset.token).trim());
  const widths = measured.map((node) => `${Math.round(node.previousElementSibling.getBoundingClientRect().width * 10) / 10}px`);
  tokens.forEach((node, i) => {
    if (node.textContent !== values[i]) node.textContent = values[i];
  });
  measured.forEach((node, i) => {
    if (node.textContent !== widths[i]) node.textContent = widths[i];
  });
}

// ---------- start ----------

async function start() {
  await theme.initTheme();
  document.getElementById("surface-version").textContent = `theming surface v${THEMING_SURFACE_VERSION}`;

  const built = [
    meaningSection(),
    studyCardSection(),
    listeningSection(),
    speakingSection(),
    recognisersSection({ section, demo }),
    practiceSection({ section, demo, states, resettable }),
    knowledgeSection({ section, demo, states }),
    gamesSection(),
    motionSection(),
    characterSection(),
    artSection(),
    tintaActsSection(),
    sessionSection(),
    settingsSection(),
    readerSection(),
    librarySection({ section, demo, states }),
    exploreSection({ section, demo, states }),
    aiSection({ section, demo, states }),
    studySection({ section, demo }),
    feedbackSection(),
    progressSection(),
    shellSection(),
    controlsSection(),
    surfacesSection(),
    tokensSection(),
    surfaceSection(),
  ];
  document.getElementById("sections").replaceChildren(...built);
  document.getElementById("toc").replaceChildren(
    ...built.map((s) => el("a", { href: `#${s.id}`, class: "ds-toc-link" }, s.querySelector('[data-part="section-title"]').textContent)),
  );

  const panel = document.getElementById("panel");
  buildAppearance(document.getElementById("appearance"));
  document.getElementById("panel-close").append(icon("cross"));
  document.getElementById("panel-open").addEventListener("click", () => panel.toggleAttribute("data-open"));
  document.getElementById("panel-close").addEventListener("click", () => panel.removeAttribute("data-open"));

  theme.onChange(() => refreshValues());
  refreshValues();
  // Demos that need their frame laid out first (a held word's toolbar) finish on the next frame.
  await new Promise(requestAnimationFrame);
  const check = renderSurfaceCheck();
  // For automated checks (scripts/design-check.mjs).
  document.documentElement.dataset.surfaceCheck = check.ok ? "pass" : "fail";
  window.lxDesign = { check, theme };
}

start().catch((error) => {
  console.error("[design] failed to start", error);
  document.getElementById("sections").replaceChildren(el("p", {}, `The design page couldn't start: ${error.message}`));
});

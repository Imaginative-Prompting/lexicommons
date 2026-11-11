// Japanese typed in romaji, turned into kana before it's graded (speech/match.js, for study/typed.js's Type it, Type the word and the gaps): for a
// learner whose phone has no Japanese keyboard. Hepburn as it's taught (shi, chi, tsu, fu, ji, kya, sha, ja), the spellings a keyboard takes as
// well (si, ti, tu, hu, zi, di, du, wo, xa, ltu), っ from a doubled consonant (kitte, matcha), ん from n at the end, before a consonant or as n' (or
// nn) before a vowel or y (kin'en: きんえん, kinen: きねん, kon'ya: こんや), a long vowel as written (toukyou, koohii), as a macron (tōkyō, kōhī: ō
// tried as ou and as oo) or as a dash (ko-hi-: ー), and the particles as they're said standing alone (wa, e, o: は, へ, を; konnichiwa's wa too).
// Pure: each guess is hiragana, which the matcher compares with what's written, katakana folded to hiragana (match.js characters).

const SYLLABLES = `
a あ i い u う e え o お
ka か ki き ku く ke け ko こ ca か cu く co こ qa くぁ
sa さ shi し si し su す se せ so そ
ta た chi ち ti ち tsu つ tu つ te て to と
na な ni に nu ぬ ne ね no の
ha は hi ひ fu ふ hu ふ he へ ho ほ
ma ま mi み mu む me め mo も
ya や yu ゆ yo よ
ra ら ri り ru る re れ ro ろ
wa わ wi うぃ we うぇ wo を
ga が gi ぎ gu ぐ ge げ go ご
za ざ ji じ zi じ zu ず ze ぜ zo ぞ
da だ di ぢ du づ de で do ど
ba ば bi び bu ぶ be べ bo ぼ
pa ぱ pi ぴ pu ぷ pe ぺ po ぽ
va ゔぁ vi ゔぃ vu ゔ ve ゔぇ vo ゔぉ
kya きゃ kyu きゅ kyo きょ kye きぇ
sha しゃ shu しゅ sho しょ she しぇ sya しゃ syu しゅ syo しょ
cha ちゃ chu ちゅ cho ちょ che ちぇ tya ちゃ tyu ちゅ tyo ちょ cya ちゃ cyu ちゅ cyo ちょ
nya にゃ nyu にゅ nyo にょ hya ひゃ hyu ひゅ hyo ひょ mya みゃ myu みゅ myo みょ rya りゃ ryu りゅ ryo りょ
gya ぎゃ gyu ぎゅ gyo ぎょ ja じゃ ju じゅ jo じょ je じぇ jya じゃ jyu じゅ jyo じょ zya じゃ zyu じゅ zyo じょ
bya びゃ byu びゅ byo びょ pya ぴゃ pyu ぴゅ pyo ぴょ dya ぢゃ dyu ぢゅ dyo ぢょ
fa ふぁ fi ふぃ fe ふぇ fo ふぉ fyu ふゅ thi てぃ dhi でぃ twu とぅ dwu どぅ tsa つぁ tsi つぃ tse つぇ tso つぉ
xa ぁ xi ぃ xu ぅ xe ぇ xo ぉ la ぁ li ぃ lu ぅ le ぇ lo ぉ xya ゃ xyu ゅ xyo ょ lya ゃ lyu ゅ lyo ょ xtu っ ltu っ xtsu っ ltsu っ xwa ゎ lwa ゎ
`;

/** Each romaji syllable (Hepburn, and the spellings a keyboard takes) and its hiragana. */
export const ROMAJI = Object.freeze(Object.fromEntries((([...tokens]) => tokens.flatMap((t, i, all) => (i % 2 ? [] : [[t, all[i + 1]]])))(SYLLABLES.trim().split(/\s+/))));
const LONGEST = Math.max(...Object.keys(ROMAJI).map((key) => key.length));
const VOWEL = /[aiueo]/;
const LATIN = /[a-zāīūēōâîûêô]/i;

/** Whether a text has romaji in it (a Latin letter): only then is it read as romaji. */
export const hasRomaji = (text) => LATIN.test(String(text ?? ""));

/**
 * A run of romaji (one word, no spaces) as hiragana, the rules above; a long vowel's macron taken as `long` gives it ("ou" or "oo" for ō). What
 * isn't romaji stays as it is (the matcher then finds it wrong).
 */
export function toKana(word, { long = { ō: "ou", ū: "uu", ā: "aa", ī: "ii", ē: "ei" } } = {}) {
  const s = String(word ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[āâ]/g, long.ā)
    .replace(/[īî]/g, long.ī)
    .replace(/[ūû]/g, long.ū)
    .replace(/[ēê]/g, long.ē)
    .replace(/[ōô]/g, long.ō)
    .replace(/[’`]/g, "'");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === "-") {
      out += "ー";
      i++;
      continue;
    }
    if (c === "'") {
      i++;
      continue;
    }
    if (c === "n") {
      // ん: at the end, before a consonant, as n' (or n before n and a vowel or y: konnichiwa's first n), and nn before a consonant or the end.
      if (next === undefined || next === "'") {
        out += "ん";
        i += next === "'" ? 2 : 1;
        continue;
      }
      if (next === "n") {
        const after = s[i + 2];
        out += "ん";
        i += after !== undefined && (VOWEL.test(after) || after === "y") ? 1 : 2;
        continue;
      }
      if (!VOWEL.test(next) && next !== "y") {
        out += "ん";
        i++;
        continue;
      }
    }
    // っ: a doubled consonant (kitte, zasshi), and t before ch (matcha).
    if (/[bcdfghjklmpqrstvwxyz]/.test(c) && (next === c || (c === "t" && s.startsWith("ch", i + 1)))) {
      out += "っ";
      i++;
      continue;
    }
    let taken = false;
    for (let n = Math.min(LONGEST, s.length - i); n > 0; n--) {
      const kana = ROMAJI[s.slice(i, i + n)];
      if (kana) {
        out += kana;
        i += n;
        taken = true;
        break;
      }
    }
    if (!taken) {
      out += c;
      i++;
    }
  }
  return out;
}

// The particles a learner writes as they're said, standing alone: は (wa), へ (e), を (o, wo).
const PARTICLES = { wa: "は", e: "へ", o: "を", wo: "を" };

/**
 * What a typed text could be in kana, if it's romaji: its words (split where they're spaced) each turned into hiragana, a lone particle as it's
 * written (wa: は), joined; again with each macron's other long vowel (ō as oo, ē as ee), and with a word's last wa as は (konnichiwa, konbanwa).
 * [] when there's no romaji in it. A few guesses at most; the matcher takes the closest.
 */
export function romajiGuesses(text) {
  const typed = String(text ?? "");
  if (!hasRomaji(typed)) return [];
  const words = typed.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  const longs = [
    { ō: "ou", ū: "uu", ā: "aa", ī: "ii", ē: "ei" },
    { ō: "oo", ū: "uu", ā: "aa", ī: "ii", ē: "ee" },
  ];
  const guesses = new Set();
  for (const long of longs) {
    for (const finalWa of [false, true]) {
      const kana = words.map((word) => {
        const bare = word.toLowerCase().replace(/[^\p{L}'’`-]/gu, "");
        if (words.length > 1 && Object.hasOwn(PARTICLES, bare)) return PARTICLES[bare];
        const converted = toKana(word.replace(/[^\p{L}'’`-]/gu, ""), { long });
        return finalWa && /わ$/.test(converted) && converted.length > 1 ? `${converted.slice(0, -1)}は` : converted;
      });
      guesses.add(kana.join(""));
    }
  }
  return [...guesses];
}

// ---------- katakana as hiragana, for comparing (match.js characters) ----------

const VOWEL_OF = (() => {
  const of = {};
  const rows = { a: "あかさたなはまやらわがざだばぱぁゃゎ", i: "いきしちにひみりぎじぢびぴぃ", u: "うくすつぬふむゆるぐずづぶぷぅゅゔ", e: "えけせてねへめれげぜでべぺぇ", o: "おこそとのほもよろをごぞどぼぽぉょ" };
  for (const [vowel, kana] of Object.entries(rows)) for (const ch of kana) of[ch] = { a: "あ", i: "い", u: "う", e: "え", o: "お" }[vowel];
  return of;
})();

/**
 * Japanese text as one kana for comparing: katakana as hiragana, and a long vowel's ー as the vowel it lengthens (コーヒー: こおひい), so what's
 * typed in romaji or in either kana is compared with what's written by how it's said. Anything else as it is.
 */
export function foldKana(text) {
  let out = "";
  for (const ch of String(text ?? "")) {
    const code = ch.codePointAt(0);
    const kana = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch;
    if (kana === "ー" && out) {
      const vowel = VOWEL_OF[out.at(-1)];
      out += vowel ?? "ー";
      continue;
    }
    out += kana;
  }
  return out;
}

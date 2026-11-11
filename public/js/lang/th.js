// Thai (lang/index.js has what each field means).
// Written without spaces between words (a space marks the end of a phrase or a sentence, and nothing else), so a
// sentence's words are split once, by whoever writes it, as a learner's dictionary lists them, and kept as written
// (segmenter "fixed", separator ""). Particles (ไหม, ครับ, ค่ะ) and classifiers (ตัว, คน) are words of their own. Thai
// words don't inflect, so a word's lemma is the word itself. Every word carries its Paiboon+ reading (lang/readings.js),
// over it until you know it: tones as marks, long vowels doubled (sà-wàt-dii, kâao-pàt). A sentence has no end mark.
// Polite speech ends with ครับ (a man speaking) or ค่ะ / คะ (a woman: ค่ะ in a statement, คะ in a question), and each
// sentence keeps one speaker's forms (ผม with ครับ, ฉัน with ค่ะ); the literal line says who's speaking. The literal line
// gives each chunk's English in Thai order: a particle with no English of its own adds a short note in brackets.

export default {
  name: "Thai",
  locale: "th-TH",
  segmenter: "fixed",
  separator: "",
  lemmaCase: "any",
  readings: "paiboon",
  abbreviations: [],
  // Little words a sentence can do without: a tile of one fits nowhere it doesn't belong.
  stray: ["ไหม", "แล้ว", "มาก", "นะ", "ด้วย"],
  patterns: {
    svo: { name: "Basic order: subject, verb, object", about: "The subject comes first, then the verb, then its object, as in English: ผมกินข้าว, I eat rice.", after: [] },
    "no-is-adjective": { name: "Adjectives without is", about: "An adjective says what something is like on its own, with no word for is: อากาศร้อน, it's hot (the weather is hot).", after: ["svo"] },
    "describer-after": { name: "Describing words come after", about: "A describing word goes after the noun it describes: บ้านใหญ่, a big house; แมวดำ, a black cat.", after: ["no-is-adjective"] },
    "very-after": { name: "มาก: very, after the word", about: "มาก goes after the adjective or verb it makes stronger: ร้อนมาก, very hot; ชอบมาก, like a lot.", after: ["no-is-adjective"] },
    "negative-mai": { name: "ไม่: not", about: "ไม่ goes right before a verb or an adjective to say not: ผมไม่เข้าใจ, I don't understand; ไม่แพง, not expensive.", after: ["svo"] },
    "question-mai": { name: "ไหม: yes/no questions", about: "ไหม at the end makes a yes/no question; the order stays the same: คุณหิวไหม, are you hungry? To answer, repeat the verb (หิว) or say ไม่ with it.", after: ["svo"] },
    "question-words": { name: "Question words stay in place", about: "อะไร, ที่ไหน, ใคร and เท่าไหร่ go where the answer would, usually at the end: คุณชื่ออะไร, what's your name?", after: ["question-mai"] },
    polite: { name: "ครับ and ค่ะ: polite endings", about: "A polite sentence ends with ครับ when a man says it, and ค่ะ when a woman does (คะ in her question): ขอบคุณครับ, thank you.", after: [] },
    "drop-subject": { name: "Leaving out I and you", about: "When it's clear who's meant, Thai leaves out the subject: ไปไหน, where (are you) going?; ไม่รู้, (I) don't know.", after: ["svo"] },
    pen: { name: "เป็น: is (a noun)", about: "เป็น joins a person or thing to what it is: ผมเป็นครู, I'm a teacher. It doesn't go before an adjective.", after: ["svo"] },
    yuu: { name: "อยู่: is at, lives at", about: "อยู่ says where someone or something is: ห้องน้ำอยู่ที่ไหน, where's the bathroom?; ฉันอยู่กรุงเทพ, I live in Bangkok.", after: ["svo"] },
    mii: { name: "มี: have, there is", about: "มี means have, or there is: ผมมีพี่ชาย, I have an older brother; ที่นี่มีร้านกาแฟ, there's a cafe here.", after: ["svo"] },
    "khong-of": { name: "ของ: 's, of", about: "The owner comes after the thing, with ของ between or not: บ้านของฉัน or บ้านฉัน, my house.", after: ["describer-after"] },
    classifiers: { name: "Counting with classifiers", about: "To count, say the thing, then the number, then its classifier: แมวสองตัว, two cats; กาแฟหนึ่งแก้ว, a cup of coffee. ตัว is for animals, คน for people, แก้ว for glasses and cups.", after: ["describer-after"] },
    "time-words": { name: "When: first or last", about: "A time word goes at the start or the end of the sentence: วันนี้อากาศร้อน, it's hot today; ผมไปตลาดเมื่อวาน, I went to the market yesterday.", after: ["svo"] },
    "ja-future": { name: "จะ: will", about: "จะ before the verb says something will happen: พรุ่งนี้ฉันจะไป, I'll go tomorrow.", after: ["time-words"] },
    "laew-already": { name: "แล้ว: already, done", about: "แล้ว at the end says it has happened, or things have changed: ผมกินแล้ว, I've eaten; ฝนตกแล้ว, it's started raining.", after: ["svo"] },
    "kamlang-now": { name: "กำลัง: doing now", about: "กำลัง before a verb says it's happening right now: ฉันกำลังกินข้าว, I'm eating.", after: ["svo"] },
    "yaak-want": { name: "อยาก: want to", about: "อยาก before a verb says you want to do it: ผมอยากไปทะเล, I want to go to the beach.", after: ["svo"] },
    "dai-can": { name: "ได้: can, after the verb", about: "ได้ after a verb (and its object) says you can do it: ฉันพูดภาษาไทยได้, I can speak Thai. With ไม่ before ได้: can't.", after: ["negative-mai"] },
    "kap-with": { name: "กับ: with, and", about: "กับ means with, or joins two people or things: ผมไปกับเพื่อน, I'm going with a friend; ข้าวกับไก่, rice and chicken.", after: ["svo"] },
    "request-khor": { name: "ขอ and หน่อย: asking for things", about: "ขอ before a thing asks for it, and หน่อย at the end softens a request: ขอน้ำหน่อย, some water, please; ช่วยพูดช้าๆหน่อย, please speak slowly.", after: ["svo"] },
  },
};

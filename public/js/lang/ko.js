// Korean (lang/index.js has what each field means).
// Written with spaces between eojeol: what the app calls a word is an eojeol, a content word with its particles and
// endings attached (학교에 is "to school", 먹었어요 "ate"). A word's lemma is its content word's dictionary form (학교,
// 먹다, 공부하다; a noun with 이에요 on it has the noun's), so particles and endings are patterns here, never words.
// Hangul has no case: lemmas are "any". The literal line puts a particle's meaning into its word's chunk ("to school");
// 은/는, 이/가 and 을/를, which English has no word for, add nothing, and neither does the I or you Korean leaves
// unsaid. Polite speech throughout: everyday 해요 style, except set phrases said in 합니다 style (잘 먹겠습니다).

export default {
  name: "Korean",
  locale: "ko-KR",
  segmenter: "spaces",
  separator: " ",
  lemmaCase: "any",
  abbreviations: [],
  // Particles alone: they only ever sit on a word, so a tile of one fits nowhere.
  stray: ["는", "를", "에서", "도", "요"],
  patterns: {
    "verb-last": { name: "The verb comes last", about: "The verb ends the sentence; who, what, where and when all come before it.", after: [] },
    "polite-yo": { name: "The everyday polite -요 form", about: "Everyday polite speech ends a verb or adjective in -아요 or -어요 (하다 becomes 해요), and the same form states, asks or suggests: the context and the voice tell which.", after: ["verb-last"] },
    topic: { name: "은/는: the topic", about: "은 (after a consonant) or 는 (after a vowel) marks what the sentence is about, or a contrast; it isn't the same as an English subject, and Korean often leaves I and you unsaid.", after: ["verb-last"] },
    subject: { name: "이/가: the subject", about: "이 or 가 marks who or what does or is something, especially with 있어요, 없어요 and words like 많아요.", after: ["topic"] },
    object: { name: "을/를: the object", about: "을 or 를 marks what the verb acts on, and it comes before the verb.", after: ["verb-last"] },
    "particle-e": { name: "에: to, at, on", about: "에 after a place means to it, or where something is; after a time it means when.", after: ["verb-last"] },
    "particle-eseo": { name: "에서: where it happens", about: "에서 marks the place where an action happens: 집에서 먹어요, I eat at home.", after: ["particle-e"] },
    copula: { name: "이에요/예요: is", about: "A noun with 이에요 (after a consonant) or 예요 (after a vowel) says what something is.", after: ["topic"] },
    "adjective-verbs": { name: "Adjectives are verbs", about: "A Korean adjective is a verb, so 작아요 alone is \"is small\"; before a noun it changes form: 매운 음식, spicy food.", after: ["polite-yo"] },
    have: { name: "있어요 / 없어요: there is, have", about: "있어요 means there is, or someone has; 없어요 is the opposite, and what's there takes 이/가.", after: ["subject"] },
    question: { name: "Questions keep their order", about: "A yes/no question usually keeps the statement's order and polite ending, and the voice often rises; a question word stays where its answer would.", after: ["polite-yo"] },
    negative: { name: "안: not", about: "안 goes right before a verb or adjective: 안 가요, I'm not going. With many 하다 verbs it goes before 해요: 공부 안 해요.", after: ["polite-yo"] },
    past: { name: "The past: -았어요/-었어요", about: "-았- or -었- before -어요 makes the past: 가요 becomes 갔어요, 먹어요 becomes 먹었어요.", after: ["polite-yo"] },
    future: { name: "-(으)ㄹ 거예요: plans and predictions", about: "A verb with -(으)ㄹ 거예요, written as two words (먹을 거예요), says what you're going to do, or what will probably happen.", after: ["polite-yo"] },
    "want-to": { name: "-고 싶어요: want to", about: "A verb's stem with -고 싶어요 says what I want to do, or asks what you want to; for someone else it's -고 싶어 해요.", after: ["polite-yo"] },
    please: { name: "주세요: please", about: "A thing with 주세요 asks for it; a verb in -아/-어 with 주세요 asks someone to do it.", after: ["polite-yo"] },
    can: { name: "-(으)ㄹ 수 있어요: can", about: "A verb with -(으)ㄹ 수 있어요 says you can do it; 없어요 instead says you can't.", after: ["have"] },
    "particle-ro": { name: "(으)로: by, with, toward", about: "으로 (after a consonant) or 로 (after a vowel or ㄹ) marks how you go, what you use, or which way: 버스로 가요, I go by bus.", after: ["particle-e"] },
    "particle-do": { name: "도: too, also", about: "도 takes the place of 은/는, 이/가 or 을/를 and adds \"too\": 저도, me too.", after: ["topic", "subject", "object"] },
    "copula-negative": { name: "아니에요: is not", about: "A noun with 이/가 and 아니에요 says what something isn't: 학생이 아니에요, I'm not a student.", after: ["copula", "subject"] },
    counters: { name: "Numbers and counters", about: "Korean counts as the thing, the number, then a counter: 동생 한 명, one younger sibling. 하나 becomes 한 and 둘 becomes 두 before a counter; a quick food order can leave the counter out: 김치찌개 하나.", after: ["subject"] },
    "particle-hago": { name: "하고: and, with", about: "하고 joins two nouns (빵하고 우유, bread and milk). It can also mark someone you do something with: 친구하고 영화를 봤어요, I watched a movie with a friend.", after: ["object"] },
    "sino-numbers": { name: "Sino-Korean numbers: 일, 이, 삼", about: "Korean has two sets of numbers. 일, 이, 삼, 사, 오… are for dates, minutes, money and floors: 오월 십일, May 10th; 만 원, 10,000 won; 삼 층, the third floor. Native 하나, 둘, 셋… count many things and usually give the hour; before 시, 셋 becomes 세, so 3:30 is 세 시 삼십 분.", after: ["counters"] },
    kkaji: { name: "까지: until, as far as", about: "까지 marks the end of a time or a route: 금요일까지, until Friday; 역까지, to the station. The start commonly takes 부터 (아홉 시부터 다섯 시까지, from nine to five) or, especially for travel, 에서 (서울에서 부산까지, from Seoul to Busan).", after: ["particle-e"] },
  },
};

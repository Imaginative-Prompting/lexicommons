// Cantonese, as Hong Kong speaks and writes it (lang/index.js has what each field means).
// Written colloquial Cantonese in Traditional characters (係, 唔, 冇, 嘅, 咗, 喺, 佢), not standard written Chinese read
// aloud: what's written is what's said. Written without spaces, so a sentence's words are split once, by whoever writes
// it, and kept as written (segmenter "fixed", separator ""). A word is what a dictionary lists (學生, 飲茶); an aspect
// marker (咗, 緊, 過), a classifier (個, 隻, 杯) and a sentence-final particle (呀, 啦, 喇, 咩) are words of their own,
// even inside a dictionary word (食 | 咗 | 飯). A word's lemma is the word itself. Every word carries its Jyutping (LSHK,
// lang/readings.js): a syllable per character, its tone number after it (nei5 hou2), as it's said in the sentence (錢
// cin2, 名 meng2), shown over it until you know it. The literal line gives each chunk's English in Cantonese order: a
// particle or a marker with no English of its own adds a short note in brackets.

export default {
  name: "Cantonese",
  locale: "yue-HK",
  segmenter: "fixed",
  separator: "",
  lemmaCase: "any",
  readings: "jyutping",
  ends: ["。", "？", "！"],
  abbreviations: [],
  // Little words a sentence can do without: a tile of one fits nowhere it doesn't belong.
  stray: ["咗", "嘅", "咩", "好", "都"],
  patterns: {
    svo: { name: "Basic order: subject, verb, object", about: "The subject comes first, then the verb, then its object, as in English: 我搭地鐵, I take the subway.", after: [] },
    "hai-is": { name: "係: is (a noun)", about: "係 joins two nouns: 我係學生, I'm a student. It doesn't go before an adjective.", after: ["svo"] },
    "adjective-hou": { name: "Adjectives without 係", about: "To say what something is like, put the adjective right after it, usually with 好 (very), and no 係: 今日好熱, it's hot today.", after: ["hai-is"] },
    "negative-m": { name: "唔: not", about: "唔 goes right before a verb or an adjective to say not: 我唔明, I don't understand; 唔貴, not expensive.", after: ["svo"] },
    "negative-mou": { name: "冇: don't have, didn't", about: "冇 means don't have (我冇車, I don't have a car), and before a verb, didn't (我尋日冇返工, I didn't go to work yesterday). Never 唔有.", after: ["negative-m", "jau-have"] },
    "a-not-a": { name: "Yes/no questions: 係唔係, 有冇", about: "Say the verb, 唔, then the verb again to ask yes or no: 係唔係, is it?; 遠唔遠, is it far?; 有 makes 有冇. Answer with the verb (係, 遠) or 唔 and the verb.", after: ["negative-m"] },
    "question-words": { name: "Question words stay in place", about: "乜嘢, 邊度, 邊個, 幾多 and 幾點 go where the answer would: 你去邊度呀？, where are you going?", after: ["svo"] },
    "final-particles": { name: "Little words at the end: 呀, 啦, 喇", about: "Spoken Cantonese ends many sentences with a particle that sets its tone: 呀 softens a question or a statement, 啦 makes a suggestion or a request (我哋走啦, let's go), 喇 says something's changed (我食飽喇, I'm full now).", after: ["svo"] },
    "ge-of": { name: "嘅: 's, of", about: "嘅 joins an owner or a describer to a noun: 我嘅書, my book; 我朋友嘅狗, my friend's dog. With family and close things it's often left out: 我媽媽.", after: ["hai-is"] },
    classifiers: { name: "Classifiers", about: "A number, 呢 (this) or 嗰 (that) takes a classifier before the noun: 一個人, one person; 兩隻貓, two cats; 呢間餐廳, this restaurant. A classifier alone before a noun can mean the: 隻貓瞓緊覺, the cat's sleeping.", after: ["svo"] },
    "zo-done": { name: "咗: done, happened", about: "咗 right after a verb says it happened: 我哋去咗飲茶, we went for dim sum; 我遲咗, I'm late.", after: ["svo"] },
    "gan-now": { name: "緊: doing now", about: "緊 right after a verb says it's going on now: 佢睇緊電視, they're watching TV.", after: ["svo"] },
    "gwo-ever": { name: "過: have ever", about: "過 right after a verb says it's happened at some time: 我去過香港, I've been to Hong Kong. To ask, end with 未: 你去過日本未呀？", after: ["zo-done"] },
    "mei-not-yet": { name: "未: not yet, and yet?", about: "未 before a verb says not yet (我未食, I haven't eaten yet), and at the end it asks yet?: 你食咗飯未呀？, have you eaten yet?", after: ["zo-done"] },
    "hai2-at": { name: "喺: at, before the verb", about: "喺 with a place goes before the verb it happens at: 我喺屋企食飯, I eat at home. As the main verb, 喺 means is at: 洗手間喺邊度？", after: ["svo"] },
    "jau-have": { name: "有: have, there is", about: "有 means have, or there is: 我有一個哥哥, I have an older brother; 屋企有冇人呀？, is anyone home?", after: ["svo"] },
    want: { name: "想 and 要: want", about: "想 before a verb says you'd like to do it (我想飲杯咖啡), and 要 before a thing asks for it (我要兩碗飯).", after: ["svo"] },
    can: { name: "識 and 會: can, will", about: "識 before a verb says you know how to (我識揸車, I can drive); 會 says something will happen (聽日會落雨, it'll rain tomorrow).", after: ["svo"] },
    "dou-also": { name: "都: also, both, all", about: "都 goes right before the verb and says it's true of everyone or everything before it: 我都係學生, I'm a student too; 佢哋都係香港人, they're all from Hong Kong.", after: ["svo"] },
    "tung-with": { name: "同: with, and", about: "同 joins two people or things (茶同咖啡, tea and coffee), and before a verb it says who with: 我同朋友去飲茶, I'm going for dim sum with friends.", after: ["svo"] },
    "bei-give": { name: "畀: give", about: "畀 means give. The thing usually comes before the person: 畀杯水我, give me a glass of water (畀我杯水 is heard too).", after: ["svo"] },
    "compare-gwo": { name: "Comparisons with 過", about: "A, the adjective, 過, then B says A is more so than B: 佢高過我, they're taller than me; 地鐵快過巴士, the subway is faster than the bus.", after: ["adjective-hou"] },
    "time-first": { name: "When comes before the verb", about: "A time word goes first, or right after the subject, before the verb: 我聽日去, I'm going tomorrow; 今日好熱, it's hot today.", after: ["svo"] },
    "m4goi-doze": { name: "唔該 and 多謝: please and thank you", about: "唔該 asks for something or thanks someone for a service (唔該埋單, the bill, please); 多謝 thanks for a gift or a kindness (多謝你嘅禮物).", after: [] },
  },
};

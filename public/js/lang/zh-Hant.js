// Chinese, in Traditional characters and Taiwan usage (lang/index.js has what each field means).
// Written without spaces, so a sentence's words are split once, by whoever writes it, and kept as written (segmenter
// "fixed", separator ""). A word is what a dictionary lists (學生, 喜歡, 吃飯); particles (的, 了, 嗎) and a measure
// word (個, 本) are words of their own. A word's lemma is the word itself (Chinese words don't inflect). Every word
// carries its pinyin, a syllable per character with tone marks (lang/readings.js), shown over it until you know it:
// a sentence's words as they're said (including bú shì and yí gè), and a pack's dictionary forms as a dictionary
// gives them (bù, yī). The literal line gives each chunk's English in Chinese order.

export default {
  name: "Chinese (Traditional)",
  locale: "zh-TW",
  segmenter: "fixed",
  separator: "",
  lemmaCase: "any",
  readings: "pinyin",
  ends: ["。", "？", "！"],
  abbreviations: [],
  // Little words a sentence can do without: a tile of one fits nowhere it doesn't belong.
  stray: ["了", "的", "嗎", "很", "也"],
  patterns: {
    svo: { name: "Basic order: subject, verb, object", about: "In a simple action sentence, the subject comes before the verb and its object after it: 我喝茶, I drink tea.", after: [] },
    "time-first": { name: "Time comes before the predicate", about: "A time word goes before the verb or adjective, first or right after the subject: 我明天去, I'm going tomorrow; 昨天很冷, it was cold yesterday.", after: ["svo"] },
    "place-zai": { name: "在: where, before the verb", about: "在 with a place goes before the verb it happens at: 我在家吃飯, I eat at home. As the main verb, 在 means be at: 捷運站在前面.", after: ["svo"] },
    shi: { name: "是: is (a noun)", about: "是 joins two nouns: 我是學生, I'm a student. It doesn't go before an adjective.", after: ["svo"] },
    adjectives: { name: "Adjectives without 是", about: "To say what something is like, put the adjective right after it, usually with 很, and no 是: 天氣很好, the weather's good.", after: ["shi"] },
    "question-ma": { name: "嗎: yes/no questions", about: "嗎 at the end makes a yes/no question; the order stays the same.", after: ["svo"] },
    "question-words": { name: "Question words stay in place", about: "什麼, 哪裡 and 幾 sit where the answer would: 你去哪裡？, where are you going?", after: ["question-ma"] },
    "negative-bu": { name: "不: not", about: "不 goes before a verb or adjective to say not, now, as a habit or in the future: 我不喝咖啡, I don't drink coffee.", after: ["svo"] },
    "negative-mei": { name: "沒: didn't, don't have", about: "沒 says something didn't happen (我沒去, I didn't go), and 沒有 is don't have. In Taiwan speech, 有 before a verb commonly asks or emphasizes whether it happened: 你有去嗎？, did you go?; 我有去, I did go. The negative is still 沒 or 沒有.", after: ["negative-bu", "you"] },
    le: { name: "了: it happened, or changed", about: "了 after a verb says it happened (我吃了, I ate); at the end of a sentence it marks a change (晚了, it's late now).", after: ["svo"] },
    de: { name: "的: 's and of", about: "的 joins a describer or an owner to a noun: 我的書, my book. With close family it's often left out: 我媽媽.", after: [] },
    "measure-words": { name: "Measure words", about: "A number, 這 or 幾 takes a measure word before the noun: 一個人, one person; 兩張票, two tickets; 這個, this one. Two is 兩 here.", after: ["svo"] },
    you: { name: "有: have, there is", about: "有 means have, or there is: 我有一個哥哥, I have an older brother; 家裡有貓, there's a cat at home. In conversational Taiwan Mandarin, 有 before a verb can also affirm that something happened.", after: ["svo"] },
    want: { name: "想 and 要: want to", about: "想 or 要 before a verb says you want to do it (我想去), and 要 before a thing asks for it (我要茶).", after: ["svo"] },
    "progressive-zai": { name: "在: doing now", about: "在 right before a verb says it's going on now: 我在看書, I'm reading.", after: ["place-zai"] },
    "please-qing": { name: "請: please", about: "請 at the start asks politely: 請坐, please sit.", after: ["svo"] },
    can: { name: "會: can, will", about: "會 before a verb says you know how to (我會開車, I can drive), or that something will happen (會下雨, it'll rain).", after: ["svo"] },
    ye: { name: "也: also", about: "也 goes right before the predicate (a verb, 想, 是 or an adjective): 我也喜歡, I like it too.", after: ["svo"] },
    "and-he": { name: "和: and, with", about: "和 joins nouns: 茶和咖啡, tea and coffee. Before a verb it can mean with: 我和朋友去, I'm going with a friend. The conjunction is often pronounced hàn in everyday Taiwan Mandarin.", after: ["svo"] },
    "give-gei": { name: "給: give; to, for", about: "給 means give, and after an action it says who it's for or to, as Taiwan says it: 媽媽煮飯給我吃, mom cooks for me; 我打電話給你, I'll call you.", after: ["svo"] },
    "comparison-bi": { name: "比: comparisons", about: "A 比 B and an adjective says A is more so than B, with no 很: 今天比昨天冷, today is colder than yesterday.", after: ["adjectives"] },
    "suggestion-ba": { name: "吧: let's", about: "吧 at the end makes a suggestion, or softens a request: 我們走吧, let's go.", after: ["svo"] },
    guo: { name: "過: past experience", about: "過 after a verb says someone has had that experience before: 我去過台北, I've been to Taipei. Taiwan speakers also commonly ask 你有去過嗎？, have you been? To say never, put 沒 before the verb: 我沒看過這部影片, I've never seen this video.", after: ["le", "negative-mei"] },
    ne: { name: "呢: follow-up questions", about: "呢 after a word asks a follow-up whose meaning comes from what was just said: 我很好，你呢？ I'm fine, what about you? After a person or thing on its own, it can ask where it is, when that's what's meant: 我的手機呢？ where's my phone?", after: ["question-ma"] },
    dou: { name: "都: all, both", about: "都 goes before the verb or adjective and says it's true of all of the people or things before it: 我們都是學生, we're all students. With a set put first, it means both or all of them: 這兩本書我都看了, I've read both of these books.", after: ["ye"] },
    hai: { name: "還: still, also, more", about: "還 before a verb can mean still or also: 他還在睡覺, he's still sleeping. 還沒 means not yet: 我還沒吃飯, I haven't eaten yet. When you've already had some, 還要 with an amount asks for another or more: 我還要一杯, I'd like another cup.", after: ["negative-mei", "want"] },
  },
};

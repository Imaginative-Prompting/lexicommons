// Chinese, in simplified characters (lang/index.js has what each field means).
// Written without spaces, so a sentence's words are split once, by whoever writes it, and kept as written (segmenter
// "fixed", separator ""). A word is what a dictionary lists (学生, 喜欢, 吃饭); particles (的, 了, 吗) and a measure
// word (个, 本) are words of their own. A word's lemma is the word itself (Chinese words don't inflect). Every word
// carries its pinyin, a syllable per character with tone marks (lang/readings.js), shown over it until you know it:
// a sentence's words as they're said (the neutral tone unmarked, and 不 and 一 changed before another syllable: bú shì,
// yí gè), and a pack's dictionary forms as a dictionary gives them (bù, yī). The literal line gives each chunk's
// English in Chinese order: 了 and 吗 usually add none of their own; a measure word goes into its number's or 这's chunk
// ("this one" for 这个), and one with meaning of its own can show it ("a cup of" for 一杯).

export default {
  name: "Chinese",
  locale: "zh-CN",
  segmenter: "fixed",
  separator: "",
  lemmaCase: "any",
  readings: "pinyin",
  ends: ["。", "？", "！"],
  abbreviations: [],
  // Little words a sentence can do without: a tile of one fits nowhere it doesn't belong.
  stray: ["了", "的", "吗", "很", "也"],
  patterns: {
    svo: { name: "Basic order: subject, verb, object", about: "In a simple action sentence, the subject comes before the verb and its object after it: 我喝茶, I drink tea.", after: [] },
    "time-first": { name: "Time comes before the predicate", about: "A time word goes before the verb or adjective, first or right after the subject: 我明天去, I'm going tomorrow; 昨天很冷, it was cold yesterday.", after: ["svo"] },
    "place-zai": { name: "在: where, before the verb", about: "在 with a place goes before the verb it happens at: 我在家吃饭, I eat at home. As the main verb, 在 means be at: 地铁站在前面.", after: ["svo"] },
    shi: { name: "是: is (a noun)", about: "是 joins two nouns: 我是学生, I'm a student. It doesn't go before an adjective.", after: ["svo"] },
    adjectives: { name: "Adjectives without 是", about: "To say what something is like, put the adjective right after it, usually with 很, and no 是: 天气很好, the weather's good.", after: ["shi"] },
    "question-ma": { name: "吗: yes/no questions", about: "吗 at the end makes a yes/no question; the order stays the same.", after: ["svo"] },
    "question-words": { name: "Question words stay in place", about: "什么, 哪儿 and 几 sit where the answer would: 你去哪儿？, where are you going?", after: ["question-ma"] },
    "negative-bu": { name: "不: not", about: "不 goes before a verb or adjective to say not, now, as a habit or in the future: 我不喝咖啡, I don't drink coffee.", after: ["svo"] },
    "negative-mei": { name: "没: didn't, don't have", about: "没 says something didn't happen (我没去, I didn't go), and 没有 is don't have.", after: ["negative-bu", "you"] },
    le: { name: "了: it happened, or changed", about: "了 after a verb says it happened (我吃了, I ate); at the end of a sentence it marks a change (晚了, it's late now).", after: ["svo"] },
    de: { name: "的: 's and of", about: "的 joins a describer or an owner to a noun: 我的书, my book. With close family it's often left out: 我妈妈.", after: [] },
    "measure-words": { name: "Measure words", about: "A number, 这 or 几 takes a measure word before the noun: 一个人, one person; 两张票, two tickets; 这个, this one. Two is 两 here.", after: ["svo"] },
    you: { name: "有: have, there is", about: "有 means have, or there is: 我有一个哥哥, I have an older brother; 家里有猫, there's a cat at home.", after: ["svo"] },
    want: { name: "想 and 要: want to", about: "想 or 要 before a verb says you want to do it (我想去), and 要 before a thing asks for it (我要茶).", after: ["svo"] },
    "progressive-zai": { name: "在: doing now", about: "在 right before a verb says it's going on now: 我在看书, I'm reading.", after: ["place-zai"] },
    "please-qing": { name: "请: please", about: "请 at the start asks politely: 请坐, please sit.", after: ["svo"] },
    can: { name: "会: can, will", about: "会 before a verb says you know how to (我会开车, I can drive), or that something will happen (会下雨, it'll rain).", after: ["svo"] },
    ye: { name: "也: also", about: "也 goes right before the predicate (a verb, 想, 是 or an adjective): 我也喜欢, I like it too.", after: ["svo"] },
    "and-he": { name: "和: and, with", about: "和 joins nouns: 茶和咖啡, tea and coffee. Before a verb it can mean with: 我和朋友去, I'm going with a friend.", after: ["svo"] },
    "give-gei": { name: "给: give; to, for", about: "给 means give, and before another verb it says who it's for or to: 妈妈给我做饭, mom cooks for me.", after: ["svo"] },
    "comparison-bi": { name: "比: comparisons", about: "A 比 B and an adjective says A is more so than B, with no 很: 今天比昨天冷, today is colder than yesterday.", after: ["adjectives"] },
    "suggestion-ba": { name: "吧: let's", about: "吧 at the end makes a suggestion, or softens a request: 我们走吧, let's go.", after: ["svo"] },
    guo: { name: "过: past experience", about: "过 after a verb says someone has had that experience before: 我去过北京, I've been to Beijing. To say never, put 没 before the verb: 我没看过这部电影, I've never seen this movie.", after: ["le", "negative-mei"] },
    ne: { name: "呢: follow-up questions", about: "呢 after a word asks a follow-up whose meaning comes from what was just said: 我很好，你呢？ I'm fine, what about you? After a person or thing on its own, it can ask where it is, when that's what's meant: 我的手机呢？ where's my phone?", after: ["question-ma"] },
    dou: { name: "都: all, both", about: "都 goes before the verb or adjective and says it's true of all of the people or things before it: 我们都是学生, we're all students. With a set put first, it means both or all of them: 这两本书我都看了, I've read both of these books.", after: ["ye"] },
    hai: { name: "还: still, also, more", about: "还 before a verb can mean still or also: 他还在睡觉, he's still sleeping. 还没 means not yet: 我还没吃饭, I haven't eaten yet. When you've already had some, 还要 with an amount asks for another or more: 我还要一杯, I'd like another cup.", after: ["negative-mei", "want"] },
  },
};

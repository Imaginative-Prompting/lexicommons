// A short text of our own, woven into Dutch, Korean, Japanese and Chinese, for the design page's demos, Read's woven try-out and the
// reader's checks: the opening of "The Bakery on the Corner" (two paragraphs, five sentences), as a lexicommons-book
// and a lexicommons-weave per language. Texts people read come from the library or from them; this one only shows how
// the parts look and behave.

import { bookVersion, sentenceHash } from "./book-format.js";
import { parseText } from "./import-text.js";

export const DEMO_TEXT = `Every morning before the sun was up, Mila unlocked the bakery on the corner and switched on the ovens. The street was quiet. Only the cat from number nine watched her through the window, as it always did.

She liked this hour best. The bread did not need her yet, the radio played old songs, and for a while the whole town seemed to belong to her.`;

// Per sentence: t (one [target, lemma] per English word, in English order), text (the natural sentence), m (the
// literal line: [target word, the English it carries, its source words, lemma], in the language's order), c (its
// patterns) and u (idiom upgrades: [first word, how many, the target shown once their words are known]).
const DUTCH = [
  {
    t: [["Elke", "elk"], ["ochtend", "ochtend"], ["voordat", "voordat"], ["de", "de"], ["zon", "zon"], ["was", "zijn"], ["op,", "op"], ["Mila", null], ["ontsloot", "ontsluiten"], ["de", "de"], ["bakkerij", "bakkerij"], ["op", "op"], ["de", "de"], ["hoek", "hoek"], ["en", "en"], ["zette", "aanzetten"], ["aan", "aan"], ["de", "de"], ["ovens.", "oven"]],
    text: "Elke ochtend voordat de zon op was, ontsloot Mila de bakkerij op de hoek en zette de ovens aan.",
    m: [["Elke", "Every", [0], "elk"], ["ochtend", "morning", [1], "ochtend"], ["voordat", "before", [2], "voordat"], ["de", "the", [3], "de"], ["zon", "sun", [4], "zon"], ["op", "up", [6], "op"], ["was,", "was", [5], "zijn"], ["ontsloot", "unlocked", [8], "ontsluiten"], ["Mila", "Mila", [7], null], ["de", "the", [9], "de"], ["bakkerij", "bakery", [10], "bakkerij"], ["op", "on", [11], "op"], ["de", "the", [12], "de"], ["hoek", "corner", [13], "hoek"], ["en", "and", [14], "en"], ["zette", "switched", [15], "aanzetten"], ["de", "the", [17], "de"], ["ovens", "ovens", [18], "oven"], ["aan.", "on", [16], "aan"]],
    c: ["v2", "dat", "separable"],
  },
  {
    t: [["De", "de"], ["straat", "straat"], ["was", "zijn"], ["stil.", "stil"]],
    text: "De straat was stil.",
    m: [["De", "The", [0], "de"], ["straat", "street", [1], "straat"], ["was", "was", [2], "zijn"], ["stil.", "quiet", [3], "stil"]],
  },
  {
    t: [["Alleen", "alleen"], ["de", "de"], ["kat", "kat"], ["van", "van"], ["nummer", "nummer"], ["negen", "negen"], ["bekeek", "bekijken"], ["haar", "zij"], ["door", "door"], ["het", "het"], ["raam,", "raam"], ["zoals", "zoals"], ["hij", "hij"], ["altijd", "altijd"], ["deed.", "doen"]],
    text: "Alleen de kat van nummer negen bekeek haar door het raam, zoals hij altijd deed.",
    m: [["Alleen", "Only", [0], "alleen"], ["de", "the", [1], "de"], ["kat", "cat", [2], "kat"], ["van", "from", [3], "van"], ["nummer", "number", [4], "nummer"], ["negen", "nine", [5], "negen"], ["bekeek", "watched", [6], "bekijken"], ["haar", "her", [7], "zij"], ["door", "through", [8], "door"], ["het", "the", [9], "het"], ["raam,", "window", [10], "raam"], ["zoals", "as", [11], "zoals"], ["hij", "it", [12], "hij"], ["altijd", "always", [13], "altijd"], ["deed.", "did", [14], "doen"]],
  },
  {
    t: [["Ze", "zij"], ["vond", "vinden"], ["dit", "dit"], ["uur", "uur"], ["het fijnst.", "fijn"]],
    text: "Dit uur vond ze het fijnst.",
    m: [["Dit", "this", [2], "dit"], ["uur", "hour", [3], "uur"], ["vond", "liked", [1], "vinden"], ["ze", "She", [0], "zij"], ["het", "best", [4], null], ["fijnst.", "best", [4], "fijn"]],
    c: ["v2"],
  },
  {
    t: [["Het", "het"], ["brood", "brood"], ["did", null], ["niet", "niet"], ["had nodig", "nodig hebben"], ["haar", "zij"], ["nog,", "nog"], ["de", "de"], ["radio", "radio"], ["speelde", "spelen"], ["oude", "oud"], ["liedjes,", "liedje"], ["en", "en"], ["voor", "voor"], ["een", "een"], ["tijdje", "tijdje"], ["de", "de"], ["hele", "heel"], ["stad", "stad"], ["leek", "lijken"], ["te", "te"], ["horen", "horen"], ["bij", "bij"], ["haar.", "zij"]],
    text: "Het brood had haar nog niet nodig, de radio speelde oude liedjes, en voor een tijdje leek de hele stad bij haar te horen.",
    m: [["Het", "The", [0], "het"], ["brood", "bread", [1], "brood"], ["had", "need", [4], "nodig hebben"], ["haar", "her", [5], "zij"], ["nog", "yet", [6], "nog"], ["niet", "not", [3], "niet"], ["nodig,", "need", [4], "nodig hebben"], ["de", "the", [7], "de"], ["radio", "radio", [8], "radio"], ["speelde", "played", [9], "spelen"], ["oude", "old", [10], "oud"], ["liedjes,", "songs", [11], "liedje"], ["en", "and", [12], "en"], ["voor", "for", [13], "voor"], ["een", "a", [14], "een"], ["tijdje", "while", [15], "tijdje"], ["leek", "seemed", [19], "lijken"], ["de", "the", [16], "de"], ["hele", "whole", [17], "heel"], ["stad", "town", [18], "stad"], ["bij", "to", [22], "bij"], ["haar", "her", [23], "zij"], ["te", "to", [20], "te"], ["horen.", "belong", [21], "horen"]],
    c: ["v2", "niet"],
  },
];

// Korean, written as Korean books are: the narration in the plain past (-았다/-었다). In English order a word stands
// without its particles, and an English word Korean says with a particle or an ending (on, and, the) stays English.
const KOREAN = [
  {
    t: [["매일", "매일"], ["아침", "아침"], ["전", "전"], ["the", null], ["해", "해"], ["was", null], ["뜨기,", "뜨다"], ["Mila", null], ["열고", "열다"], ["the", null], ["빵집", "빵집"], ["on", null], ["the", null], ["모퉁이", "모퉁이"], ["and", null], ["켰다", "켜다"], ["on", null], ["the", null], ["오븐.", "오븐"]],
    text: "매일 아침 해가 뜨기 전에 밀라는 모퉁이 빵집을 열고 오븐을 켰다.",
    m: [["매일", "Every", [0], "매일"], ["아침", "morning", [1], "아침"], ["해가", "the sun", [3, 4], "해"], ["뜨기", "was up", [5, 6], "뜨다"], ["전에", "before", [2], "전"], ["밀라는", "Mila", [7], null], ["모퉁이", "on the corner", [11, 12, 13], "모퉁이"], ["빵집을", "the bakery", [9, 10], "빵집"], ["열고", "unlocked and", [8, 14], "열다"], ["오븐을", "the ovens", [17, 18], "오븐"], ["켰다.", "switched on", [15, 16], "켜다"]],
    c: ["verb-last", "topic", "subject", "object", "particle-e"],
  },
  {
    t: [["The", null], ["거리", "거리"], ["was", null], ["조용했다.", "조용하다"]],
    text: "거리는 조용했다.",
    m: [["거리는", "The street", [0, 1], "거리"], ["조용했다.", "was quiet", [2, 3], "조용하다"]],
    c: ["verb-last", "topic", "adjective-verbs"],
  },
  {
    // Korean narration names Mila where English says she or her again, so she and her stay English (그녀 isn't
    // Korean's word for every her).
    t: [["Only", null], ["the", null], ["고양이", "고양이"], ["from", null], ["번지", "번지"], ["구", "구"], ["지켜보았다", "지켜보다"], ["her", null], ["너머", "너머"], ["the", null], ["창문,", "창문"], ["as", null], ["it", null], ["언제나", "언제나"], ["그랬듯이.", "그러다"]],
    text: "구 번지의 고양이만이 언제나 그랬듯이 창문 너머로 밀라를 지켜보았다.",
    m: [["구", "nine", [5], "구"], ["번지의", "from number", [3, 4], "번지"], ["고양이만이", "Only the cat", [0, 1, 2], "고양이"], ["언제나", "always", [13], "언제나"], ["그랬듯이", "as it did", [11, 12, 14], "그러다"], ["창문", "the window", [9, 10], "창문"], ["너머로", "through", [8], "너머"], ["밀라를", "her", [7], null], ["지켜보았다.", "watched", [6], "지켜보다"]],
    c: ["verb-last", "subject", "object", "particle-ro"],
  },
  {
    t: [["She", null], ["좋아했다", "좋아하다"], ["이", "이"], ["시간", "시간"], ["가장.", "가장"]],
    text: "밀라는 이 시간을 가장 좋아했다.",
    m: [["밀라는", "She", [0], null], ["이", "this", [2], "이"], ["시간을", "hour", [3], "시간"], ["가장", "best", [4], "가장"], ["좋아했다.", "liked", [1], "좋아하다"]],
    c: ["verb-last", "topic", "object"],
  },
  {
    t: [["The", null], ["빵", "빵"], ["did", null], ["않았고", "않다"], ["필요하지", "필요하다"], ["her", null], ["아직,", "아직"], ["the", null], ["라디오", "라디오"], ["흘러나왔고", "흘러나오다"], ["옛", "옛"], ["노래,", "노래"], ["and", null], ["for", null], ["a", null], ["한동안", "한동안"], ["the", null], ["온", "온"], ["마을", "마을"], ["같았다", "같다"], ["to", null], ["belong", null], ["to", null], ["her.", null]],
    text: "빵에는 아직 밀라가 필요하지 않았고, 라디오에서는 옛 노래가 흘러나왔고, 한동안은 온 마을이 밀라의 것 같았다.",
    m: [["빵에는", "The bread", [0, 1], "빵"], ["아직", "yet", [6], "아직"], ["밀라가", "her", [5], null], ["필요하지", "need", [4], "필요하다"], ["않았고,", "did not", [2, 3], "않다"], ["라디오에서는", "the radio", [7, 8], "라디오"], ["옛", "old", [10], "옛"], ["노래가", "songs", [11], "노래"], ["흘러나왔고,", "played and", [9, 12], "흘러나오다"], ["한동안은", "for a while", [13, 14, 15], "한동안"], ["온", "the whole", [16, 17], "온"], ["마을이", "town", [18], "마을"], ["밀라의", "her", [23], null], ["것", "belong to", [21, 22], "것"], ["같았다.", "seemed to", [19, 20], "같다"]],
    // "for a while" is 한동안: once it's known it shows in their place. (Belong stays English: 것 is "thing".)
    u: [[13, 3, "한동안"]],
    c: ["verb-last", "topic", "subject", "adjective-verbs"],
  },
];

// Japanese, written as a published translation is: the narration in the plain past, the words split once (particles
// on their own), and every word with kanji carrying its reading in hiragana (t's third, m's fifth). In English order a
// word stands without its particles, and an English word Japanese says with a particle stays English. A particle
// English has no word for carries itself in the literal line.
const JAPANESE = [
  {
    t: [["毎朝", "毎朝", "まいあさ"], ["morning", null], ["前", "前", "まえ"], ["the", null], ["日", "日", "ひ"], ["was", null], ["昇る,", "昇る", "のぼる"], ["Mila", null], ["開けて", "開ける", "あけて"], ["the", null], ["パン屋", "パン屋", "ぱんや"], ["on", null], ["the", null], ["角", "角", "かど"], ["and", null], ["つけた", "つける"], ["on", null], ["the", null], ["オーブン.", "オーブン"]],
    text: "毎朝、日が昇る前に、ミラは角のパン屋を開けて、オーブンをつけた。",
    m: [["毎朝、", "Every morning", [0, 1], "毎朝", "まいあさ"], ["日", "the sun", [3, 4], "日", "ひ"], ["が", "が", [], null], ["昇る", "was up", [5, 6], "昇る", "のぼる"], ["前", "before", [2], "前", "まえ"], ["に、", "before", [2], null], ["ミラ", "Mila", [7], null], ["は", "は", [], null], ["角", "the corner", [12, 13], "角", "かど"], ["の", "on", [11], null], ["パン屋", "the bakery", [9, 10], "パン屋", "ぱんや"], ["を", "を", [], null], ["開けて、", "unlocked and", [8, 14], "開ける", "あけて"], ["オーブン", "the ovens", [17, 18], "オーブン"], ["を", "を", [], null], ["つけた。", "switched on", [15, 16], "つける"]],
    // "Every morning" is one word, 毎朝: it shows in their place once it's known.
    u: [[0, 2, "毎朝"]],
    c: ["verb-last", "topic-wa", "subject-ga", "object-o", "particle-ni", "possessive-no"],
  },
  {
    t: [["The", null], ["通り", "通り", "とおり"], ["だった", "だ"], ["静か.", "静か", "しずか"]],
    text: "通りは静かだった。",
    m: [["通り", "The street", [0, 1], "通り", "とおり"], ["は", "は", [], null], ["静か", "quiet", [3], "静か", "しずか"], ["だった。", "was", [2], "だ"]],
    c: ["verb-last", "topic-wa"],
  },
  {
    // Japanese narration names Mila where English says she or her again, so she and her stay English.
    t: [["Only", null], ["the", null], ["猫", "猫", "ねこ"], ["from", null], ["番地", "番地", "ばんち"], ["九", "九", "きゅう"], ["見ていた", "見る", "みていた"], ["her", null], ["越し", "越し", "ごし"], ["the", null], ["窓,", "窓", "まど"], ["as", null], ["it", null], ["いつも", "いつも"], ["did.", null]],
    text: "九番地の猫だけが、いつものように窓越しにミラを見ていた。",
    m: [["九", "nine", [5], "九", "きゅう"], ["番地", "number", [4], "番地", "ばんち"], ["の", "from", [3], null], ["猫", "the cat", [1, 2], "猫", "ねこ"], ["だけ", "Only", [0], null], ["が、", "が", [], null], ["いつも", "always", [13], "いつも"], ["の", "の", [], null], ["よう", "as it did", [11, 12, 14], "よう"], ["に", "as it did", [11, 12, 14], null], ["窓", "the window", [9, 10], "窓", "まど"], ["越し", "through", [8], "越し", "ごし"], ["に", "through", [8], null], ["ミラ", "her", [7], null], ["を", "を", [], null], ["見ていた。", "watched", [6], "見る", "みていた"]],
    c: ["verb-last", "subject-ga", "object-o", "possessive-no"],
  },
  {
    t: [["She", null], ["好き", "好き", "すき"], ["この", "この"], ["時間", "時間", "じかん"], ["一番.", "一番", "いちばん"]],
    text: "ミラはこの時間が一番好きだった。",
    m: [["ミラ", "She", [0], null], ["は", "は", [], null], ["この", "this", [2], "この"], ["時間", "hour", [3], "時間", "じかん"], ["が", "が", [], null], ["一番", "best", [4], "一番", "いちばん"], ["好き", "liked", [1], "好き", "すき"], ["だった。", "liked", [1], "だ"]],
    c: ["verb-last", "topic-wa", "subject-ga"],
  },
  {
    t: [["The", null], ["パン", "パン"], ["did", null], ["not", null], ["要らず", "要る", "いらず"], ["her", null], ["まだ,", "まだ"], ["the", null], ["ラジオ", "ラジオ"], ["流し", "流す", "ながし"], ["古い", "古い", "ふるい"], ["歌,", "歌", "うた"], ["and", null], ["for", null], ["a", null], ["しばらく", "しばらく"], ["the", null], ["全体", "全体", "ぜんたい"], ["町", "町", "まち"], ["思えた", "思える", "おもえた"], ["to", null], ["belong", null], ["to", null], ["her.", null]],
    text: "パンにはまだミラが要らず、ラジオは古い歌を流し、しばらくの間、町全体がミラのものに思えた。",
    m: [["パン", "The bread", [0, 1], "パン"], ["に", "に", [], null], ["は", "は", [], null], ["まだ", "yet", [6], "まだ"], ["ミラ", "her", [5], null], ["が", "が", [], null], ["要らず、", "did not need", [2, 3, 4], "要る", "いらず"], ["ラジオ", "the radio", [7, 8], "ラジオ"], ["は", "は", [], null], ["古い", "old", [10], "古い", "ふるい"], ["歌", "songs", [11], "歌", "うた"], ["を", "を", [], null], ["流し、", "played and", [9, 12], "流す", "ながし"], ["しばらく", "for a while", [13, 14, 15], "しばらく"], ["の", "for a while", [13, 14, 15], null], ["間、", "for a while", [13, 14, 15], "間", "あいだ"], ["町", "town", [18], "町", "まち"], ["全体", "the whole", [16, 17], "全体", "ぜんたい"], ["が", "が", [], null], ["ミラ", "her", [23], null], ["の", "の", [], null], ["もの", "belong to", [21, 22], "もの"], ["に", "に", [], null], ["思えた。", "seemed to", [19, 20], "思える", "おもえた"]],
    // "for a while" is しばらく: once it's known it shows in their place. (Belong stays English: もの is "thing".)
    u: [[13, 3, "しばらく"]],
    c: ["verb-last", "topic-wa", "subject-ga", "object-o", "possessive-no"],
  },
];

// Chinese, in simplified characters: the words split once (了, 着, 的 and a measure word on their own, sharing the cue of
// the word they go with), and every word carrying its pinyin (t's third, m's fifth), as it's said in the sentence. In
// English order a word shows alone (看, not 看着): 着 and 个 are words of their own, not yet known.
const CHINESE = [
  {
    t: [["每天", "每天", "měi tiān"], ["早上", "早上", "zǎo shang"], ["之前", "之前", "zhī qián"], ["the", null], ["太阳", "太阳", "tài yáng"], ["was", null], ["升起,", "升起", "shēng qǐ"], ["Mila", null], ["打开", "打开", "dǎ kāi"], ["the", null], ["面包店", "面包店", "miàn bāo diàn"], ["on", null], ["the", null], ["街角", "街角", "jiē jiǎo"], ["and", null], ["启动", "启动", "qǐ dòng"], ["on", null], ["the", null], ["烤箱.", "烤箱", "kǎo xiāng"]],
    text: "每天早上太阳升起之前，米拉打开街角面包店的门，启动烤箱。",
    m: [["每天", "Every", [0], "每天", "měi tiān"], ["早上", "morning", [1], "早上", "zǎo shang"], ["太阳", "the sun", [3, 4], "太阳", "tài yáng"], ["升起", "was up", [5, 6], "升起", "shēng qǐ"], ["之前，", "before", [2], "之前", "zhī qián"], ["米拉", "Mila", [7], null, "Mǐ lā"], ["打开", "unlocked", [8], "打开", "dǎ kāi"], ["街角", "on the corner", [11, 12, 13], "街角", "jiē jiǎo"], ["面包店", "the bakery", [9, 10], "面包店", "miàn bāo diàn"], ["的", "the bakery", [9, 10], "的", "de"], ["门，", "the bakery", [9, 10], "门", "mén"], ["启动", "switched on", [15, 16], "启动", "qǐ dòng"], ["烤箱。", "the ovens", [17, 18], "烤箱", "kǎo xiāng"]],
    c: ["svo", "time-first", "de"],
  },
  {
    t: [["The", null], ["街上", "街上", "jiē shang"], ["was", null], ["安静.", "安静", "ān jìng"]],
    text: "街上很安静。",
    m: [["街上", "The street", [0, 1], "街上", "jiē shang"], ["很", "was", [2], "很", "hěn"], ["安静。", "quiet", [3], "安静", "ān jìng"]],
    c: ["adjectives"],
  },
  {
    t: [["只有", "只有", "zhǐ yǒu"], ["the", null], ["猫", "猫", "māo"], ["from", null], ["号", "号", "hào"], ["九", "九", "jiǔ"], ["看", "看", "kàn"], ["她", "她", "tā"], ["隔", "隔", "gé"], ["the", null], ["窗户,", "窗户", "chuāng hu"], ["像", "像", "xiàng"], ["it", null], ["往常", "往常", "wǎng cháng"], ["did.", null]],
    text: "只有九号的猫像往常一样，隔着窗户看着她。",
    m: [["只有", "Only", [0], "只有", "zhǐ yǒu"], ["九", "nine", [5], "九", "jiǔ"], ["号", "number", [4], "号", "hào"], ["的", "from", [3], "的", "de"], ["猫", "the cat", [1, 2], "猫", "māo"], ["像", "as", [11], "像", "xiàng"], ["往常", "always", [13], "往常", "wǎng cháng"], ["一样，", "it did", [12, 14], "一样", "yí yàng"], ["隔", "through", [8], "隔", "gé"], ["着", "through", [8], "着", "zhe"], ["窗户", "the window", [9, 10], "窗户", "chuāng hu"], ["看", "watched", [6], "看", "kàn"], ["着", "watched", [6], "着", "zhe"], ["她。", "her", [7], "她", "tā"]],
    c: ["svo", "de"],
  },
  {
    t: [["她", "她", "tā"], ["喜欢", "喜欢", "xǐ huan"], ["这", "这", "zhè"], ["时候", "时候", "shí hou"], ["最.", "最", "zuì"]],
    text: "她最喜欢这个时候。",
    m: [["她", "She", [0], "她", "tā"], ["最", "best", [4], "最", "zuì"], ["喜欢", "liked", [1], "喜欢", "xǐ huan"], ["这", "this", [2], "这", "zhè"], ["个", "this", [2], "个", "ge"], ["时候。", "hour", [3], "时候", "shí hou"]],
    c: ["svo", "measure-words"],
  },
  {
    t: [["The", null], ["面包", "面包", "miàn bāo"], ["did", null], ["不", "不", "bù"], ["需要", "需要", "xū yào"], ["她", "她", "tā"], ["还,", "还", "hái"], ["the", null], ["收音机", "收音机", "shōu yīn jī"], ["放", "放", "fàng"], ["old", null], ["老歌,", "老歌", "lǎo gē"], ["and", null], ["for", null], ["a", null], ["一会儿", "一会儿", "yí huì r"], ["the", null], ["整个", "整个", "zhěng gè"], ["小镇", "小镇", "xiǎo zhèn"], ["好像", "好像", "hǎo xiàng"], ["to", null], ["属于", "属于", "shǔ yú"], ["to", null], ["她.", "她", "tā"]],
    text: "面包还不需要她，收音机里放着老歌，有那么一会儿，整个小镇好像都属于她。",
    m: [["面包", "The bread", [0, 1], "面包", "miàn bāo"], ["还", "yet", [6], "还", "hái"], ["不", "did not", [2, 3], "不", "bù"], ["需要", "need", [4], "需要", "xū yào"], ["她，", "her", [5], "她", "tā"], ["收音机", "the radio", [7, 8], "收音机", "shōu yīn jī"], ["里", "the radio", [7, 8], "里", "li"], ["放", "played", [9], "放", "fàng"], ["着", "played", [9], "着", "zhe"], ["老歌，", "old songs", [10, 11], "老歌", "lǎo gē"], ["有", "for a while", [13, 14, 15], "有", "yǒu"], ["那么", "for a while", [13, 14, 15], "那么", "nà me"], ["一会儿，", "for a while", [13, 14, 15], "一会儿", "yí huì r"], ["整个", "the whole", [16, 17], "整个", "zhěng gè"], ["小镇", "town", [18], "小镇", "xiǎo zhèn"], ["好像", "seemed to", [19, 20], "好像", "hǎo xiàng"], ["都", "whole", [17], "都", "dōu"], ["属于", "belong to", [21, 22], "属于", "shǔ yú"], ["她。", "her", [23], "她", "tā"]],
    // "old songs" is one word, 老歌, and "for a while" is 有那么一会儿: once 老歌 or 一会儿 is known it shows in their place.
    u: [[10, 2, "老歌,"], [13, 3, "一会儿"]],
    c: ["svo", "time-first", "negative-bu", "you"],
  },
];

// The languages it's woven into.
const WEAVES = {
  nl: { variant: "nl-NL", sentences: DUTCH },
  ko: { variant: "ko-KR", sentences: KOREAN },
  ja: { variant: "ja-JP", sentences: JAPANESE },
  zh: { variant: "zh-CN", sentences: CHINESE },
};

/** The demo text as a book (no version: it's only shown). */
export function demoBook() {
  return { ...parseText(DEMO_TEXT, { title: "The Bakery on the Corner" }), id: "demo-bakery-corner" };
}

/** Its weave into a language (Dutch unless said: nl, ko, ja or zh), for `book` (from demoBook()). Without hashes;
 * demoChecked() fills them in. */
export function demoWeave(book, lang = "nl") {
  const { variant, sentences } = WEAVES[lang];
  return {
    format: "lexicommons-weave",
    v: 1,
    book: book.id,
    bookVersion: book.version,
    kind: "weave",
    from: "en",
    to: lang,
    variant,
    licence: "CC0-1.0",
    made: { by: "hand", note: "A demo of our own" },
    sentences: book.sentences.map(([s, e], x) => ({ s, e, h: "", ...sentences[x] })),
  };
}

/** The book and a weave with their version and sentence hashes, as validateBook and validateWeave expect. */
export async function demoChecked(lang = "nl") {
  const book = demoBook();
  book.version = await bookVersion(book);
  const weave = demoWeave(book, lang);
  for (const sentence of weave.sentences) sentence.h = await sentenceHash(book.words, sentence.s, sentence.e);
  return { book, weave };
}

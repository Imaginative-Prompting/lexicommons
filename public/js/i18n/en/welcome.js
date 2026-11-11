// The first run and the language list (shell/welcome.js): what a brand-new device is asked before anything else, and
// Settings → Language's sheet, which shows the same list. Each entry is [English, about] (lx/i18n.js has the format).

export default {
  "welcome.question": ["What do you want to learn?", "The first thing a new device shows, over everything: its title, above a search and the list of languages. One line on a phone if it can be."],
  "welcome.addLanguage": ["Add a language", "Settings → Language: the title of the drawer listing every language, and its name for screen readers."],
  "welcome.search": ["Search languages", "The search field above the list of languages: its placeholder and its label for screen readers."],
  "welcome.noMatch": ["No language by that name yet.", "Under the list of languages, when nothing matches what was typed in the search."],
  "welcome.mostSoFar": ["The most so far", "Under Dutch's name in the list of languages: Dutch has the most to study so far. A row's second line, short."],
  "welcome.speakQuestion": ["Which language do you speak?", "The first run's first question, over a list of every language, and the title of Settings → Language's sheet to change it. One line if it can, two at most at 390 px."],
  "welcome.thisPhone": ["This phone's language", "The first run and Settings → Language: the small line under a language the device is set to, at the top of the list. A few words."],
  "welcome.youSpeak": ["You speak {language}.", "The first run's second question (what to learn): a small line over the list saying what the person answered first; a Change link follows it. {language}: a language's name."],
  "welcome.change": ["Change", "The first run: a small link after \"You speak …\", back to the first question. One word."],
};

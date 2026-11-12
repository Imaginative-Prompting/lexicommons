// The first run and the language list (shell/welcome.js): what a brand-new device is asked before anything else, and
// Settings → Language's sheet, which shows the same list. Each entry is [English, about] (lx/i18n.js has the format).

export default {
  "welcome.question": ["What do you want to learn?", "The first thing a new device shows, over everything: its title, above a search and the list of languages. One line on a phone if it can be."],
  "welcome.addLanguage": ["Add a language", "Settings → Language: the title of the drawer listing every language, and its name for screen readers."],
  "welcome.search": ["Search languages", "The search field above the list of languages: its placeholder and its label for screen readers."],
  "welcome.noMatch": ["No language by that name yet.", "Under the list of languages, when nothing matches what was typed in the search."],
  "welcome.fullCourses": ["Full courses", "The list of languages to learn: the small heading over the languages that have a whole course of lessons. Two words."],
  "welcome.firstLessons": ["First lessons", "The list of languages to learn: the small heading over every other language, which has a starter (its first dozen lessons) so far. Two words."],
  "welcome.placement.question": ["Do you know some {language} already?", "The first run, right after a language with a full course is picked: the title of the second (and last) question. {language} is the language's name, as the list showed it."],
  "welcome.placement.lead": ["If you do, about 20 questions find where you start. You can stop whenever you like.", "The first run's second question: the line under its title, saying what answering yes leads to (a short check that places you on the path). One or two short sentences."],
  "welcome.placement.new": ["No, I'm new to it", "The first run's second question: the first answer, for someone who knows none of the language (they start with lesson 1). A few words."],
  "welcome.placement.newSub": ["Start with lesson 1", "The first run's second question: the small line under No, I'm new to it, saying where that answer leads. A few words."],
  "welcome.placement.few": ["A few words", "The first run's second question: the answer for someone who knows a little of the language (the check starts near the beginning). A few words."],
  "welcome.placement.by": ["Enough to get by", "The first run's second question: the answer for someone who can manage simple everyday things (the check starts a third of the way in). A few words."],
  "welcome.placement.talk": ["I can hold a conversation", "The first run's second question: the answer for someone who can talk in the language already (the check starts past halfway). A few words."],
  "welcome.lessons": ["{count, plural, one {# lesson} other {# lessons}}", "Under a language's name in the list of languages to learn, for one with a full course: how many lessons it has (200)."],
};

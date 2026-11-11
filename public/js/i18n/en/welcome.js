// The first run and the language list (shell/welcome.js): what a brand-new device is asked before anything else, and
// Settings → Language's sheet, which shows the same list. Each entry is [English, about] (lx/i18n.js has the format).

export default {
  "welcome.question": ["What do you want to learn?", "The first thing a new device shows, over everything: its title, above a search and the list of languages. One line on a phone if it can be."],
  "welcome.addLanguage": ["Add a language", "Settings → Language: the title of the drawer listing every language, and its name for screen readers."],
  "welcome.search": ["Search languages", "The search field above the list of languages: its placeholder and its label for screen readers."],
  "welcome.noMatch": ["No language by that name yet.", "Under the list of languages, when nothing matches what was typed in the search."],
  "welcome.fullCourses": ["Full courses", "The list of languages to learn: the small heading over the languages that have a whole course of lessons. Two words."],
  "welcome.firstLessons": ["First lessons", "The list of languages to learn: the small heading over every other language, which has a starter (its first dozen lessons) so far. Two words."],
  "welcome.lessons": ["{count, plural, one {# lesson} other {# lessons}}", "Under a language's name in the list of languages to learn, for one with a full course: how many lessons it has (200)."],
};

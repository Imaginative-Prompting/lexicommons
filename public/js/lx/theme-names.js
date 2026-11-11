// A ready-made theme's name as the app shows it, in the reader's language. A flag's theme is named for its place on its tile ("Japan",
// under the flag, on a page of flags), and as "Japan's flag" where the name stands alone (the switch's toast, Settings' Appearance row, a
// theme of yours that starts from it), so it reads as a look, not a country. Places come from the browser (Intl.DisplayNames), but the
// ten flags that aren't a country's, whose words are ours.

import { flagPlace, readyTheme } from "./theme-presets.js";
import { intlLocale, t } from "./i18n.js";

const PLACE_WORDS = {
  "es-ct": () => t("settings.appearance.placeCatalonia"),
  "es-ga": () => t("settings.appearance.placeGalicia"),
  "es-pv": () => t("settings.appearance.placeBasque"),
  "gb-sct": () => t("settings.appearance.placeScotland"),
  "gb-wls": () => t("settings.appearance.placeWales"),
  "fr-bre": () => t("settings.appearance.placeBrittany"),
  "nl-fr": () => t("settings.appearance.placeFriesland"),
  "us-hi": () => t("settings.appearance.placeHawaii"),
  esperanto: () => t("settings.appearance.placeEsperanto"),
  kurdistan: () => t("settings.appearance.placeKurdistan"),
};
const placeOf = (ready) => PLACE_WORDS[ready.flag]?.() ?? flagPlace(ready.flag, intlLocale());
// How English says a place in "Japan's flag": a plural name takes "the" and the apostrophe alone (the Netherlands' flag), a few others "the"
// (the Basque Country's flag). The message's {form}: a language that doesn't need it leaves it out.
const ENGLISH_FORM = { nl: "plural", ph: "plural", us: "plural", "es-pv": "the" };

/** A ready-made theme's name on its tile: a flag's place ("Japan"), else its own name. */
export const tileName = (ready) => (ready.group === "flag" ? placeOf(ready) : ready.name);

/** A theme's name where it stands alone, by id: a flag's "Japan's flag", a ready-made theme's own name, else `fallback` (a built-in's). */
export function themeLabel(id, fallback = id) {
  const ready = readyTheme(id);
  if (!ready) return fallback;
  return ready.group === "flag" ? t("settings.appearance.flagName", { place: placeOf(ready), form: ENGLISH_FORM[ready.flag] ?? "other" }) : ready.name;
}

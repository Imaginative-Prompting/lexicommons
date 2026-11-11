// The interface's locales on this device (plan-localization.md): which have shipped (i18n/shipped.js) and a shipped one's
// words, its strings file /i18n/<code>.json read through readStrings (lx/i18n.js), so an entry translated from older
// English, or one that doesn't read, shows English. The files are in sw.js SHELL, so a shipped locale works offline.
// English is built in. Settings → Language (shell/interface-language.js) asks these and calls setLocale.
//   shippedLocales()   the codes, "en" first; sync
//   loadLocale(code)   a Promise of the strings (a Map), or null: for "en", a code not shipped, or a file that won't load
//                      or read as that locale (asked again next time)

import { SHIPPED } from "../i18n/shipped.js";
import { readStrings } from "./i18n.js";

/** The same over any list and fetch: what the app uses (below), and what test-i18n.mjs drives with a planted locale. */
export function makeLocales(shipped, get = (url) => fetch(url)) {
  const codes = ["en", ...shipped.filter((code) => code !== "en")];
  const loaded = new Map();
  const load = async (code) => {
    const response = await get(`/i18n/${code}.json`);
    if (!response?.ok) return null;
    const read = readStrings(await response.json());
    return read.locale === code ? read.strings : null;
  };
  return {
    shippedLocales: () => [...codes],
    loadLocale(code) {
      if (code === "en" || !codes.includes(code)) return Promise.resolve(null);
      if (!loaded.has(code)) {
        const promise = load(code).catch(() => null);
        loaded.set(code, promise);
        // A miss isn't kept: offline or a bad file now, the next ask tries again.
        promise.then((strings) => strings || loaded.delete(code));
      }
      return loaded.get(code);
    },
  };
}

const here = makeLocales(SHIPPED);
export const shippedLocales = here.shippedLocales;
export const loadLocale = here.loadLocale;

// The interface's locales that have shipped: English (built in, from i18n/en/) and each one whose strings file is
// public/i18n/<code>.json. A freeze that ships a locale adds it here and both files to sw.js SHELL; test-i18n.mjs fails on
// a code here without its file or its SHELL line, and on a file in public/i18n/ that isn't here.
export const SHIPPED = ["en"];

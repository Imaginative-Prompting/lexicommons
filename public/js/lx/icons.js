// Lexicommons icons: 24px drawings, stroke-only, round caps, in NeedWright's icon style. Each meaning has one icon,
// so meaning never travels by color alone.

const PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  sparkle: '<path d="M11 3.5l1.8 5.2 5.2 1.8-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8z"/><path d="M18.5 15.5v4M16.5 17.5h4"/>',
  bulb: '<path d="M9.5 17.5h5M10.5 20.5h3"/><path d="M12 3.5a5.8 5.8 0 0 0-3.5 10.4c.7.5 1 1.3 1 2.1v1.5h5V16c0-.8.3-1.6 1-2.1A5.8 5.8 0 0 0 12 3.5z"/>',
  moved: '<path d="M4 8.5h14M14.5 5l3.5 3.5-3.5 3.5"/><path d="M20 15.5H6M9.5 12 6 15.5 9.5 19"/>',
  speaker: '<path d="M4.5 9.5v5h3.5l4.5 4V5.5L8 9.5z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  // Can't listen now: the speaker with no sound (an x where its waves are), never the cross (that's "wrong").
  "speaker-off": '<path d="M4.5 9.5v5h3.5l4.5 4V5.5L8 9.5z"/><path d="M15.5 9l6 6M21.5 9l-6 6"/>',
  book: '<path d="M12 6.5c-2.4-1.4-5-1.6-7.5-.8v13c2.5-.8 5.1-.6 7.5.8 2.4-1.4 5-1.6 7.5-.8v-13c-2.5-.8-5.1-.6-7.5.8z"/><path d="M12 6.5v13"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M2.8 12h2M19.2 12h2M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  cards: '<rect x="4" y="7" width="12.5" height="13" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v10.5"/>',
  chart: '<path d="M6 19.5v-5M12 19.5V9.5M18 19.5V4.5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M18.8 10.4l2.4.3a9.3 9.3 0 0 1 0 2.6l-2.4.3a7 7 0 0 1-.9 2.1l1.5 1.9a9.3 9.3 0 0 1-1.8 1.8l-1.9-1.5a7 7 0 0 1-2.1.9l-.3 2.4a9.3 9.3 0 0 1-2.6 0l-.3-2.4a7 7 0 0 1-2.1-.9l-1.9 1.5a9.3 9.3 0 0 1-1.8-1.8l1.5-1.9a7 7 0 0 1-.9-2.1l-2.4-.3a9.3 9.3 0 0 1 0-2.6l2.4-.3a7 7 0 0 1 .9-2.1L4.6 6.4a9.3 9.3 0 0 1 1.8-1.8l1.9 1.5a7 7 0 0 1 2.1-.9l.3-2.4a9.3 9.3 0 0 1 2.6 0l.3 2.4a7 7 0 0 1 2.1.9l1.9-1.5a9.3 9.3 0 0 1 1.8 1.8l-1.5 1.9a7 7 0 0 1 .9 2.1z"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/>',
  share: '<path d="M12 3.5v11M8.5 7 12 3.5 15.5 7"/><path d="M8.5 10.5h-2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/>',
  "more-v": '<circle cx="12" cy="5.5" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="12" cy="18.5" r="1.1"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  "plus-square": '<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z"/>',
  pause: '<path d="M9 6.5v11M15 6.5v11"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 3-5 3.6-8.4 2.4 1.6 3.4 4 3.4 5.5 1-.6 1.6-1.9 1.7-3.1 1.9 1.6 3.3 3.8 3.3 6C18 18.6 15.6 21 12 21z"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
  upload: '<path d="M12 15V4.5M7.5 9L12 4.5 16.5 9"/><path d="M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  download: '<path d="M12 4.5V15M7.5 10.5L12 15l4.5-4.5"/><path d="M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  chat: '<path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.3V17h-.5A2.5 2.5 0 0 1 4 14.5v-8A2.5 2.5 0 0 1 6.5 4z"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-2.5 3.8-3 6.5-.4 2.2-1.6 3.5-3.5 3.5"/><path d="M10 9.5a2 2 0 0 1 4 0"/>',
  pencil: '<path d="M15.3 4.7a2.1 2.1 0 0 1 3 3L8.4 17.6l-3.9.9.9-3.9z"/><path d="m13.6 6.4 3 3"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  // Can't speak now: the mic struck through.
  "mic-off": '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M4 4l16 16"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 19 4M16 7l2.5 2.5M13.8 9.2l2 2"/>',
  cloud: '<path d="M7.5 18.5H17a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.6a4.5 4.5 0 0 0 .5 8.9z"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.6 1.7-1.6h2.2a3.8 3.8 0 0 0 3.8-3.8C20.5 6.9 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 10.5v6M14 10.5v6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  // Learn more, on a result: a question mark in its ring (study/learn-more.js). Not info's "i": it asks, and what it opens answers.
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.7a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.6v.4"/>',
  plug: '<path d="M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0zM12 15.5v5"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.9 3.8-6 7.5-6s6.7 2.1 7.5 6"/>',
  tag: '<path d="M3.8 12.6V4.8a1 1 0 0 1 1-1h7.8l7.6 7.6a1 1 0 0 1 0 1.4l-6.8 6.8a1 1 0 0 1-1.4 0z"/><circle cx="8.3" cy="8.3" r="1.3"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  logout: '<path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14M10 12h10M16.5 8.5 20 12l-3.5 3.5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  skip: '<path d="M6 6.5l7 5.5-7 5.5zM17.5 6v12"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
  sliders: '<path d="M4 7h8.5M16.5 7H20M4 17h2.5M10.5 17H20"/><circle cx="14.5" cy="7" r="2"/><circle cx="8.5" cy="17" r="2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/>',
  expand: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  contract: '<path d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M4 15h4a1 1 0 0 1 1 1v4M15 20v-4a1 1 0 0 1 1-1h4"/>',
  more: '<circle cx="5.5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/>',
};

/** The icon for each meaning: what makes a meaning readable without its color. */
export const MEANING_ICON = { right: "check", wrong: "cross", slipping: "clock", new: "sparkle", hint: "bulb", moved: "moved" };

const SVG = "http://www.w3.org/2000/svg";

export function icon(name, label) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "lx-icon");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  // The drawings are fixed strings in this file, never user input.
  svg.innerHTML = PATHS[name] ?? PATHS.sparkle;
  return svg;
}

export const ICON_NAMES = Object.keys(PATHS);

/** The same icon as markup, for the pages the server renders (src/pages.ts) and markup builders. */
export function iconMarkup(name) {
  return `<svg viewBox="0 0 24 24" class="lx-icon" aria-hidden="true">${PATHS[name] ?? PATHS.sparkle}</svg>`;
}

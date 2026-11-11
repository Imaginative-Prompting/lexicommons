// The Lexicommons app: four tabs (Home, Study, Read, Explore; with an AI connected, a setting puts AI in Read's place) and Settings, on
// hash routes:
//   #today · #study · #study/path[/<lesson>] ·
//   #study/session/<mode>[/<arg>][?from=today|know|path|explore] ·
//   #study/practice[/…] · #read · #read/paste · #read/book/<id> · #know · #know/<unit> · #know/skills ·
//   #know/list/<kind>/<skill> · #know/grammar · #know/common · #know/words/<start> · #know/week · #know/days ·
//   #ai · #ai/new/<kind> · #ai/request/<id> · #practice[/…] · #explore · #settings[/<section>]
// Know, Read and AI always have their addresses; a page with no tab opens under Home (#today, the address from before it was called Home). Practice lives
// in the AI section; #study/practice[/…] still opens it in Study.
// Built from the design system (lx/ui.js) under the person's appearance (lx/theme.js). A session opens over the
// Study page, and a text opens in the reader over the Read page, so closing either lands back where you were.

// First, so it's listening before anything else runs: what breaks reaches us, cleaned (lx/error-report.js).
import "../lx/error-report.js";
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import * as theme from "../lx/theme.js";
import * as motion from "../lx/motion.js";
import { loadProgress } from "../study/progress.js";
import { loadWordIndex } from "../know/word-index.js";
import { loadPlanKept } from "../study/plan-kept.js";
import { loadPacks, syncLibraryPacks } from "../study/packs.js";
import { loadClips } from "../study/clips.js";
import { checkPackInbox, startPackInbox } from "../study/pack-inbox.js";
import { startStudyRecord } from "../ai/study-record.js";
import { rememberProviders } from "../storage.js";
import { startSync } from "../sync.js";
import { loadFrequency } from "../study/frequency.js";
import { warmWhileIdle } from "../study/warm-idle.js";
import { learning, learningFrom, learningFromName, learningName, onLearningChange } from "../study/learning.js";
import { runSession } from "../study/session.js";
import { SignedOut, keptMe, whoAmI } from "./api.js";
import { hostedReady } from "../ai/hosted.js";
import { checkKeyPresence, ownKeyPresent } from "../ai/own-key.js";
import { renderStudy } from "./study.js";
import { watchForUpdates } from "./new-version.js";
import { renderSettings } from "./settings.js";
import { mayNeedWelcome, needsWelcome, openWelcome } from "./welcome.js";
import { applyInterface, onInterfaceShown } from "./interface-language.js";
import { htmlDir, htmlLang, languageLabel } from "../lx/i18n.js";
import { lookToast, watchLook } from "./look-watch.js";
import { renderTodo, TODO_TABS } from "./todo.js";
import { renderRead } from "../read/library.js";
import { openReader } from "../read/reader.js";
import { renderToday } from "../know/today.js";
import { renderKnow } from "../know/page.js";
import { renderPractice } from "../practice/home.js";
import { renderAi } from "../ai/tab.js";
import { aiConnected, onLayoutChange, setAiConnected, THIRD_TABS, thirdTab } from "./layout.js";
import { renderExplore } from "../explore/explore.js";
import { setExploreAccount } from "../explore/home-data.js";
import { setAiAccount } from "../ai/client.js";
import { copyOf, followSwipeBack, picture, slide as slidePage } from "./page-slide.js";
import { startReminders } from "../push.js";
import { sampleAtStart } from "../study/sample-mode.js";
import { SAMPLE_PRESETS } from "../study/sample-learner.js";

// The splash (theme-boot.js decided before the first paint, and its first frame is already drawn): it runs over the app,
// which starts under it at once. Nothing waits for it. A still one is theme-boot.js's alone; with none, its markup goes.
{
  const splash = document.documentElement.getAttribute("data-splash");
  const drop = () => {
    document.querySelector(".lx-splash")?.remove();
    document.documentElement.removeAttribute("data-splash");
  };
  if (splash === "play")
    import("../character/splash-run.js").catch((error) => {
      drop();
      console.error(error);
    });
  else if (!splash) drop();
}

const PAGES = { today: "Home", study: "Study", read: "Read", know: "Knowledge", ai: "AI", practice: "Practice", explore: "Explore" };
const tabs = () => [
  ["today", "Home", "sun"],
  ["study", "Study", "cards"],
  ["know", "Knowledge", "chart"],
  ...(thirdTab() ? [[thirdTab(), THIRD_TABS[thirdTab()].label, THIRD_TABS[thirdTab()].icon]] : []),
  ["explore", "Explore", "compass"],
];
// The page without a tab lights up the tab it lives under, and shows that tab's background.
// Practice is the AI tab's; the AI section with no tab of its own is a row in Settings, and lives under it.
// With no AI connected the AI section is a row in Settings, and lives under it; once one is, a row on Home.
const UNDER = { read: "today", ai: "today", practice: "ai" };
const underOf = (page) => (page === "ai" && !aiConnected() ? "settings" : UNDER[page]);
const tabOf = (page) => {
  for (let at = page, hops = 0; at && hops < 3; at = underOf(at), hops++) if (at === "settings" || tabs().some(([id]) => id === at)) return at;
  return page;
};
const SETTINGS_TAB = ["settings", "Settings", "gear"];

const state = {
  me: null,
  view: null, // the page in view: { key, tab, host, view, scroll } (main.js views)
  session: null,
  closing: false,
  lastTab: "#today",
  lastTabName: "Home",
  // The screen before Settings, by its route (Settings → Report a bug says it, as lx/bug-rules.js cleanContext keeps it: its names only).
  lastScreen: "/app/#today",
  installPrompt: null,
  swiping: false, // a swipe back went: its pop is already drawn
  pending: null, // a picture of the page that left, until the page arriving is drawn and slides in
};

// The app's own history (iPhone-style moves between a tab's pages, the owner's pick, 27 Oct 2026; shell/page-slide.js).
// Each entry it makes carries its place (history.state.lx.i), so a navigation knows whether it went deeper (a new entry:
// a push) or back (an earlier one: a pop). Each entry keeps where its page was scrolled to, which back puts it at
// again, and a picture of its page, which a swipe back shows underneath. In memory: a restart starts them again.
const nav = { i: 0, routes: [], scrolls: [], pictures: [] };
const routeOf = (hash) => `#${String(hash ?? "").replace(/^#\/?/, "").split("?")[0] || "today"}`;
/** The tab a route is under (its tab's own id; Settings is its own). */
function tabOfRoute(route) {
  const first = routeOf(route).slice(1).split("/")[0];
  const tab = first in PAGES || first === "settings" ? first : "today";
  return tab === "settings" ? "settings" : tabOf(tab);
}
let swipe = null;

// ---------- back: one rule ----------
// Every back is one step back through the browser's history: the app's swipe, the header's Back, the phone's own edge swipe (an iPhone's Home
// Screen app can have one, and Safari has) and a browser's button. So the history holds only what a back should reach, and one gesture moves at
// most one step:
// - A tab's own page reached from another tab (its tab in the bar, or a link to it) starts that tab's history afresh, as Android has it: Home
//   stays the first entry and the tab's page comes right after it, so a back at a tab's own page goes to Home, and only a back at Home leaves.
//   Never into a tab left a while ago. (Home's own page from another tab: Home alone.) The history steps back to do it, and nothing's drawn.
// - A page under a tab reached from another tab (Home's "things done this week" opens Knowledge's days) is an entry like any other: the
//   phone's back returns where you came from; the app's own swipe and Back stay in the tab, as before.
// - The app's swipe goes back only from the entry it started on. If the phone's own swipe went back first, it puts its page in place and stops;
//   a phone's back coming just after the app's swipe went back is undone. Either way the app leaves backs to the phone from then on. (5 Nov 2026,
//   iOS 18 Home Screen app: two backs from one swipe went a step past the page and left the screen black, the tab bar on Home.)
let afresh = null; // { href, home, phase, expect, overtaken } while the history steps back for a tab's own page
let passing = -1; // while the history steps forward again past the entries it went back through (undrawn): the entry it's going to
let appBack = false; // the app is going back itself (its swipe, Back, a page's way back): the pop that comes is its own
let swipeFrom = -1; // the entry the app's swipe started on
let swipeWent = { at: -Infinity, to: -1 }; // when the app's swipe last went back, and to which entry
// Where the app's own step through the history is going: { i, length }. An entry it arrives at may have lost its place: going to the address
// you're already on (the same address loaded again, a link to it) puts a new copy in that entry's place with no state and no hashchange, so the
// router never placed it again. Arriving there with the history no longer than when the step began, it's the entry the step went to.
// (6 Nov 2026: the step back for Knowledge's tab from Read landed on such an entry, took it for a new page and showed Study.)
let goingTo = null;
// A link pressed while that step is on its way: { href, at }. Its new entry is the link's, never the step's: at the browser's cap on a tab's
// history (50 entries) a new entry drops the oldest and the length doesn't grow, so the length alone took a link's new entry for the step's
// (7 Nov 2026, after 91 pages in a row: Study's Practice door changed the address and no session came, the entry placed as Study's).
let pressedLink = null;
/** Steps the history to the app's entry i (from the entry it's on, nav.i, or `from`). */
function stepTo(i, from = nav.i) {
  goingTo = { i, length: history.length, at: performance.now() };
  history.go(i - from);
}
const SYSTEM_BACK = "lx.system-back.v1";
function systemSwipes() {
  try {
    return localStorage.getItem(SYSTEM_BACK) === "1";
  } catch {
    return false;
  }
}
function phoneHasItsOwnBack() {
  try {
    localStorage.setItem(SYSTEM_BACK, "1");
  } catch {
    // (for this run only)
  }
  noAppSwipe = true;
}
let noAppSwipe = false;
const SESSION_OR_BOOK = /^#(study\/session|read\/book)(\/|$)/;
/** A tab's own page (Home, Study, Knowledge, Explore, the AI tab, Settings' menu). */
function isTabsOwnPage(route) {
  const [first, ...rest] = routeOf(route).slice(1).split("/");
  return rest.length === 0 && (first === "settings" || tabs().some(([id]) => id === first));
}
/** The entry a back goes to from here, when one may: the one before, never a session or a book (going back into one would open it again). */
function backEntry() {
  const route = nav.routes[nav.i - 1];
  if (route === undefined || SESSION_OR_BOOK.test(route)) return null;
  return { i: nav.i - 1, route };
}
/** A tab's own page reached from another tab: the history goes back to its first entry, and that entry becomes this page. */
function startAfresh() {
  const href = location.hash || "#today";
  if (nav.i === 0) return; // (the app opened on it: nothing before it to keep)
  const home = routeOf(href) === "#today";
  // Already Home and then this tab's page.
  if (!home && nav.i === 1 && nav.routes[0] === "#today") return;
  // To the first entry (Home's, or to become Home's), or straight to the second when the first is Home's already.
  const to = !home && nav.routes[0] === "#today" ? 1 : 0;
  afresh = { href, home, phase: to === 0 ? "first" : "tab", expect: to, overtaken: null, from: nav.i, length: history.length, pressed: null };
  stepTo(to);
  setTimeout(() => {
    if (afresh?.href !== href) return;
    // Overtaken and the step back never came (a browser can drop it for the page that came first): the old entries simply stay.
    if (afresh.overtaken !== null) afresh = null;
    // At Home's entry, and the step on to the tab's never came: the tab's page goes after Home as a new entry.
    else if (afresh.phase === "tab" && history.state?.lx?.i === 0) {
      afresh = null;
      for (const list of [nav.routes, nav.scrolls, nav.pictures]) list.length = 0;
      nav.i = 0;
      nav.routes[0] = "#today";
      location.hash = href;
    }
    // (A history shorter than the app's record, which nothing should make: this entry stays as it is.)
    else finishAfresh({ moved: false });
  }, 1500);
}
function finishAfresh({ moved = true } = {}) {
  const { href, home } = afresh;
  afresh = null;
  for (const list of [nav.routes, nav.scrolls, nav.pictures]) list.length = 0;
  if (!moved) {
    // (A history shorter than the app's record, which nothing should make: this entry stays as it is, the first.)
    history.replaceState({ ...(history.state ?? {}), lx: { i: 0 } }, "");
    nav.i = 0;
    nav.routes[0] = routeOf(href);
    return;
  }
  const i = home ? 0 : 1;
  history.replaceState({ ...(history.state ?? {}), lx: { i } }, "", href);
  nav.i = i;
  nav.routes[0] = "#today";
  nav.routes[i] = routeOf(href);
}
// What the checks read (scripts/back-check.mjs): the app's record of the history, against the browser's.
globalThis.__lxNav = () => ({ i: nav.i, routes: [...nav.routes], afresh: Boolean(afresh), systemSwipes: noAppSwipe || systemSwipes() });

/**
 * Goes back to `href`'s page: through the app's history when it's an earlier entry in this tab (where you left it,
 * scrolled as you left it), else in this entry's place (a page opened cold, from a link or a restart, has none before
 * it here, and back never leaves the app); either way a pop.
 */
function goBackTo(href) {
  const route = routeOf(href);
  if (backEntry()?.route === route) {
    appBack = true;
    return void stepTo(nav.i - 1);
  }
  const tab = tabOfRoute(nav.routes[nav.i] ?? location.hash);
  for (let k = nav.i - 1; k >= 0 && nav.routes[k] !== undefined && tabOfRoute(nav.routes[k]) === tab; k--) {
    if (nav.routes[k] === route) {
      appBack = true;
      return void stepTo(k);
    }
  }
  const from = nav.i;
  history.replaceState({ ...(history.state ?? {}), lx: { i: nav.i } }, "", href);
  nav.routes[nav.i] = route;
  render(false, { kind: "pop", from, replaced: true });
}

// A link to the address you're on goes nowhere (after the app's own handlers, which may act on it: the tab you're on scrolls to its top). The
// browser would put a new copy in this entry's place with no state, its place in the app's history lost (goingTo).
addEventListener("click", (event) => {
  const link = event.target instanceof Element && event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.getAttribute("href") === (location.hash || "#today")) event.preventDefault();
  else pressedLink = { href: link.getAttribute("href"), at: performance.now() };
});

// A finger held on a link, a picture or a button opens no menu of the browser's (Android's "Open in new tab", "Download image"): an app's
// controls have none. Fields keep theirs (paste); a mouse's right press is left alone. (iPhone's preview: shell.css, -webkit-touch-callout.)
addEventListener("contextmenu", (event) => {
  const touch = "pointerType" in event && event.pointerType ? event.pointerType === "touch" : matchMedia("(pointer: coarse)").matches;
  const field = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  if (touch && !field) event.preventDefault();
});

addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
});

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "?";

// Addresses from before American spelling, still followed.
const OLD_ADDRESSES = [
  [/^#\/?practise(?=[/?]|$)/, "#practice"],
  [/^#\/?settings\/appearance\/colours(?=[/?]|$)/, "#settings/appearance/colors"],
  [/^#\/?settings\/ai(?=[/?]|$)/, "#ai/connect"],
];

// "#settings/study/quick?from=study" → tab "settings", rest ["study", "quick"], params { from: "study" }.
function parseRoute() {
  for (const [old, now] of OLD_ADDRESSES) if (old.test(location.hash)) history.replaceState(history.state, "", location.hash.replace(old, now));
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  // A malformed escape ("#study/%", a link cut short) stays as written rather than stopping the app (decodeURIComponent throws on it).
  const decode = (part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  };
  const parts = path.split("/").filter(Boolean).map(decode);
  const tab = parts[0] && (parts[0] in PAGES || parts[0] === "settings") ? parts[0] : "today";
  return { tab, rest: parts.slice(1), params: Object.fromEntries(new URLSearchParams(query)), path: `${tab}/${parts.slice(1).join("/")}` };
}

const app = el("div", { part: "app" });
const page = el("main", { part: "page", id: "page" });
// How far the page is scrolled, for the header's band (shell.css, app-header::after): none at rest, so it never lies over a page's title,
// and its whole fade once the page has scrolled that far. Followed on every scroll, and again as a route lands (a new page starts at 0).
let pageScroll = -1;
const followPageScroll = () => {
  const y = Math.min(64, Math.max(0, Math.round(page.scrollTop)));
  if (y !== pageScroll) document.documentElement.style.setProperty("--page-scroll", `${(pageScroll = y)}px`);
  followBar();
};

// A page's title in the header (ui.appHeader bar-title, components.css): the words of its large title (ui.pageTitle), centered, coming in as
// that title goes under the header: its opacity how far it has gone, 0 to 1 over the last BAR_FADE px, a pure function of the scroll (so it
// follows it both ways and a page put back where it was scrolled is in its place in its first frame). Where it would meet the back pill, the
// pill is its chevron alone, and a title still too long ends in "…": decided as the page arrives, never as it scrolls.
const BAR_FADE = 24;
let barSource = null;
function barTitle() {
  return header.querySelector(':scope > [data-part="bar-title"]');
}
function barFor(host) {
  const bar = barTitle();
  barSource = null;
  if (!bar) return;
  if (!bar.hasAttribute("data-fixed")) {
    const title = host?.querySelector('[data-part="page-title"]') ?? null;
    bar.firstElementChild.textContent = title?.textContent.trim() ?? "";
    barSource = title;
  }
  fitInFrame();
}
// The header fitted in its frame's own rendering, after that frame's layout and before its paint: fitted at once, its reads laid the page out
// inside the press or the route that changed it (opening Translate restyled the whole page there, 20 ms of a slowed phone's 50, 7 Nov 2026).
// A ResizeObserver's first notice of the header comes in that same frame, even for a header put in from inside a frame's own rAF callback (a
// rAF asked for there would wait a frame, and show it unfitted). Two headers in one frame: the last is fitted, once. Hidden, a header has no
// size and no notice: it's fitted the frame it has one. Its writes never resize the header, so nothing loops.
const fitWatch = new ResizeObserver(() => {
  fitWatch.disconnect();
  fitTitle();
  fitBar();
  followBar();
});
function fitInFrame() {
  fitWatch.disconnect();
  fitWatch.observe(header);
}
function fitBar(bar = barTitle()) {
  if (!bar) return;
  // Its content's box, inside its padding: the column's (the same both sides), or the page's beside Settings' menu (shell.css data-split).
  const edge = header.getBoundingClientRect();
  const style = getComputedStyle(header);
  const box = { left: edge.left + parseFloat(style.paddingLeft), right: edge.right - parseFloat(style.paddingRight) };
  box.width = box.right - box.left;
  const pill = header.querySelector(':scope > [data-part="app-back"]');
  const end = header.querySelector(":scope > .lx-header-end");
  // The room between the pill and the header's end, the wider of the two mirrored (a centered title clears both).
  const room = () => {
    const left = pill ? pill.getBoundingClientRect().right - box.left + 8 : 0;
    const right = end ? box.right - end.getBoundingClientRect().left + 8 : 0;
    return Math.max(0, box.width - 2 * Math.max(left, right));
  };
  header.removeAttribute("data-pill");
  let space = room();
  const need = bar.firstElementChild.getBoundingClientRect().width;
  if (need > space && pill && bar.firstElementChild.textContent) {
    header.setAttribute("data-pill", "chevron");
    space = room();
  }
  header.style.setProperty("--bar-title-room", `${Math.floor(space)}px`);
}
// A tab's header (its title, the language you're learning, your initials): where they don't all fit at the text's size (large text on a
// narrow phone; your initials too big for their circle), it gives up room before the title does, a step at a time (data-shed,
// components.css): 1 the language's code (its flag stays), 2 your initials (a gear stays, for Settings), 3 the language (Settings → Language
// has it). Only then does the title end in "…".
// Nothing ever goes past the screen's edge.
function fitTitle() {
  if (header.querySelector(':scope > [data-part="app-back"]')) return;
  const title = header.querySelector(':scope > [data-part="app-title"] > span:last-child');
  if (!title) return;
  const end = header.querySelector(":scope > .lx-header-end");
  header.removeAttribute("data-shed");
  // Your initials too big for their circle (the circle keeps its size): the gear in their place.
  const button = header.querySelector('[data-part="settings-button"]');
  const initials = button?.querySelector(".lx-initials");
  const spills = () => Boolean(initials?.offsetWidth && initials.getBoundingClientRect().width > button.clientWidth - 4);
  const crowded = () => title.scrollWidth > title.clientWidth + 1 || Boolean(end && end.getBoundingClientRect().right > header.getBoundingClientRect().right + 0.5) || spills();
  for (let step = 1; step <= 3 && crowded(); step++) header.setAttribute("data-shed", String(step));
}
// The header fitted again whenever its words change size (the phone's text size, which no resize says) or its width does; never for what a
// fit itself changes (the pill, a shed step), as those change no text's size.
let headerWatch = null;
function watchHeader() {
  headerWatch?.disconnect();
  const parts = [...header.querySelectorAll(':scope > [data-part="app-title"] > span:last-child, :scope > .lx-header-end, :scope > [data-part="app-back"], :scope > [data-part="bar-title"] > span')];
  const keyOf = () => `${header.clientWidth}|${parts.map((part) => getComputedStyle(part).fontSize).join(",")}`;
  // Its first notice (the frame it's drawn, which fitInFrame fits) only notes the sizes; reading them here would lay the page out in the
  // route's own task.
  let key = null;
  headerWatch = new ResizeObserver(() => {
    const now = keyOf();
    if (key === null || now === key) {
      key = now;
      return;
    }
    key = now;
    fitTitle();
    fitBar();
    followBar();
  });
  for (const part of parts) headerWatch.observe(part);
}
function followBar() {
  const bar = barTitle();
  if (!bar || bar.hasAttribute("data-fixed")) return;
  // A page that drew its title after it arrived: its words now.
  if (!barSource?.isConnected && state.view?.host) {
    const title = state.view.host.querySelector('[data-part="page-title"]');
    if (title && title !== barSource) {
      barSource = title;
      bar.firstElementChild.textContent = title.textContent.trim();
    }
  }
  let shown = 0;
  if (barSource?.isConnected) {
    const under = header.getBoundingClientRect().bottom;
    shown = Math.min(1, Math.max(0, (under + BAR_FADE - barSource.getBoundingClientRect().bottom) / BAR_FADE));
  }
  header.style.setProperty("--bar-shown", String(Math.round(shown * 100) / 100));
}
addEventListener("resize", () => {
  fitTitle();
  fitBar();
  followBar();
});
page.addEventListener("scroll", followPageScroll, { passive: true });
addEventListener("hashchange", () => requestAnimationFrame(followPageScroll));
let header = el("header");
let tabBar = el("nav");

// Where the tabs are a sidebar (a wide screen: components.css's 1024), it comes first among the app's parts, so a keyboard reaches it first, as
// it's seen first on the left; on a phone the tab bar stays after the page, under it. It's fixed to the screen either way, so its place among
// them moves nothing on the screen. A window crossing the width moves only the bar (what's over the page, a session or a sheet, stays where it
// is), and a focus inside it stays there.
const sidebar = globalThis.matchMedia?.("(min-width: 1024px)");
const frameParts = () => (sidebar?.matches ? [tabBar, header, page] : [header, page, tabBar]);
sidebar?.addEventListener?.("change", () => {
  if (tabBar.parentNode !== app) return;
  const focused = tabBar.contains(document.activeElement) ? document.activeElement : null;
  if (sidebar.matches) app.prepend(tabBar);
  else page.after(tabBar);
  focused?.focus({ preventScroll: true });
});

// The sample learner, while it's on (study/sample-mode.js): its mark on every page's header, so the progress shown is never taken for your
// own, with Off a tap away (back to yours at once). The same glass as the language; the preset's name is its tooltip. An admin's tool, in
// English only.
function sampleMark() {
  const name = SAMPLE_PRESETS.find((preset) => preset.id === sampleAtStart()?.preset)?.name ?? "";
  const off = el("button", { type: "button", class: "lx-sample-off", "aria-label": `Turn the sample learner off (${name})`, onclick: () => import("../study/sample-start.js").then(({ stopSample }) => stopSample()) }, "Off");
  return el("div", { part: "sample-mark", title: `Sample learner: ${name}` }, el("span", { class: "lx-sample-name" }, "Sample"), off);
}

function setHeader(title, back) {
  const language = { code: learning(), name: languageLabel(learning()), href: "#settings/language" };
  // Before the account is known (the app's frame at its start), the settings button is drawn without initials.
  const next = ui.appHeader(title, { initials: state.me ? initials(state.me.user.name) : "", back, language, mark: sampleAtStart() ? sampleMark() : undefined, onSettings: () => (location.hash = "#settings") });
  header.replaceWith(next);
  header = next;
  barFor(state.view?.host);
  watchHeader();
}

function setTabs(active) {
  // The same tabs: the bubble moves over, from wherever it is. Different tabs (Read and AI swapped): a new bar.
  const key = tabs().map(([id]) => id).join();
  if (tabBar.isConnected && tabBar.lxKey === key) return tabBar.lxSetActive(active);
  const next = ui.tabBar(tabs(), active, { settings: SETTINGS_TAB });
  next.lxKey = key;
  if (tabBar.isConnected) tabBar.replaceWith(next);
  tabBar = next;
}

/**
 * entrance: "push" when it follows a session that was up (the next one from a summary), else "up" (shell sessions are covers: session.js); "now"
 * when the phone made the move and animated it itself (its swipe forward): no move of the app's, and a session that was up goes at once too.
 */
function openSession(rest, params = {}, entrance = state.session ? "push" : "up") {
  const [, mode = "quick", ...args] = rest;
  closeSession({ push: entrance === "push", now: entrance === "now" });
  state.sessionRoute = rest.join("/");
  // A session started from Today, the Knowledge page, the path or Explore's lessons goes back there when it's over (Study otherwise).
  const back = params.from === "today" ? "#today" : params.from === "know" ? "#know" : params.from === "path" ? "#study/path" : params.from === "explore" ? "#explore" : "#study";
  state.session = runSession(app, mode, args.join("/") || undefined, {
    entrance,
    onExit: () => {
      state.session = null;
      if (state.closing) return;
      if (location.hash.startsWith("#study/session")) location.hash = back;
      // The Study page underneath shows the new numbers.
      render(true);
    },
    // Keep going after a finished day: the same run, with the next lesson's words.
    onRestart: (next) => {
      state.session = null;
      openSession(next ? [...rest.slice(0, 2), next] : rest, params, "push");
    },
  });
}

// The reader over the Read page: #read/book/<id>.
function openBook(id) {
  closeBook();
  state.bookId = id;
  state.reader = openReader(app, {
    bookId: id,
    onClose: () => {
      closeBook();
      if (location.hash.startsWith("#read/book")) location.hash = "#read";
      // The Read page underneath shows where you got to.
      render(true);
    },
  });
}

function closeBook() {
  state.reader?.end();
  state.reader = null;
  state.bookId = null;
}

// Ends a session because the route moved away from it (not because the person closed it). now: at once, with no move of its own.
function closeSession({ push = false, now = false } = {}) {
  if (!state.session) return;
  state.closing = true;
  try {
    state.session.end({ push, now });
  } finally {
    state.closing = false;
    state.session = null;
  }
}

// Each tab's own page, kept while you're elsewhere: { key, tab, host, view, scroll }. Coming back to a tab shows it at
// once as you left it, scrolled where you were, and the page refreshes itself quietly (view.refresh) rather than being
// drawn again from nothing. Each page draws into a host of its own (.lx-view), so one kept off the screen can never
// draw over the page in view.
const views = new Map();
// The pages kept: each tab's, and Settings' menu (Practice and the rest are pages under a tab, built when opened).
const KEPT_TABS = new Set(["today", "study", "read", "ai", "know", "explore", "settings"]);
// The pages that take the wider column on a wide screen (data-column="wide" on the app: shell.css, 1280 and up): the grids, Study's, Explore's
// and Knowledge's own pages, Your words, the days and the topics. Their lists and forms (Your packs, the path, a topic, a pack's page, Browse,
// Add your own) keep the 720 column: a list's switches sat 900 px from their names at 960 (the director, 9 Nov 2026). The column's move
// between the two rides the page's push.
const WIDE_PAGES = new Set(["study", "know", "know/words", "know/days", "explore", "explore/topics"]);
// Settings on a wide screen (1280 and up, the sidebar's): its menu in a pane of its own beside the page it opened (data-split="settings" on the
// app: shell.css), its row lit, as a computer's settings are. Settings itself opens its first page (Account) there: its menu alone would be the
// pane twice. The menu's way back to the menu is the pane beside it, so a first page has no back pill; a page further in keeps its own.
const SPLIT = matchMedia("(min-width: 1280px)");
let aside = null; // { host, view }: the menu in its pane, built once, drawn again as it's shown (its view's refresh)
function placeAside(on, rest) {
  if (!on) {
    aside?.host.remove();
    app.removeAttribute("data-split");
    return;
  }
  if (!aside) {
    // (Not a page's view, .lx-view: no scene after it, and never taken for the page in view.)
    const host = el("nav", { class: "lx-settings-aside", "aria-label": "Settings" });
    aside = { host, view: build(host, "settings", [], {}, { inSession: false, inBook: false }) };
  } else aside.view.refresh?.();
  if (page.firstElementChild !== aside.host) page.prepend(aside.host);
  app.setAttribute("data-split", "settings");
  const here = `#settings/${rest[0] ?? ""}`;
  for (const link of aside.host.querySelectorAll('a[href^="#"]')) {
    if (link.getAttribute("href") === here) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
SPLIT.addEventListener("change", () => parseRoute().tab === "settings" && render(true));
/** Forgets every kept page (the language changed: they're all in the old one). */
function forgetViews() {
  for (const entry of views.values()) {
    entry.view.dispose?.();
    entry.host.remove();
  }
  views.clear();
}

// A page built now is held unseen (its place kept: .lx-view[data-waiting]) until what it shows from this device is in
// (view.ready: Today's reading, Read's library, the AI tab's last answer), READY_WAIT at most, then it comes in whole with
// one quick plain fade. Anything slower holds its place with a skeleton (lx/shapes.js), so nothing moves when it comes.
const READY_WAIT = 400;
/** Marks <html data-app-drawn> once the first page is whole and has had a frame: what the first frame holds for (lx/theme-boot.js, character/splash-run.js). */
function appDrawn() {
  const done = () => requestAnimationFrame(() => setTimeout(() => document.documentElement.setAttribute("data-app-drawn", ""), 0));
  const waiting = document.querySelector("[data-waiting]");
  if (!waiting) return done();
  const watching = new MutationObserver(() => {
    if (waiting.hasAttribute("data-waiting")) return;
    watching.disconnect();
    done();
  });
  watching.observe(waiting, { attributes: true, attributeFilter: ["data-waiting"] });
}

/**
 * The pictures (an <img>: a flag, a cover) on the screen in a page built now that haven't come yet: null when there are none. Its first frame
 * waits for them, so a page never shows an empty picture box that fills a moment later (a pack's page from Study showed its language's flag
 * empty in its first frames once pages stopped fading in). Only those on the screen: one further down comes as it's scrolled to.
 */
function picturesComing(host) {
  // (Here means loaded with its pixels: WebKit calls a lazy picture that hasn't started loading complete, then starts it once it's seen.)
  const here = (img) => img.complete && img.naturalWidth > 0;
  const coming = [...host.querySelectorAll("img")].filter((img) => {
    if (here(img)) return false;
    const box = img.getBoundingClientRect();
    return box.width > 0 && box.bottom > 0 && box.top < innerHeight;
  });
  // (On the screen, so no longer lazy: a lazy picture in a page held unseen may not start until it's seen.) Its load first, then its decode:
  // WebKit's decode() of a picture that hasn't loaded yet settles at once, and the page came in with its flag empty.
  const arrived = (img) =>
    new Promise((resolve) => {
      if (here(img)) return resolve();
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    }).then(() => img.decode?.().catch(() => {}));
  for (const img of coming) img.loading = "eager";
  return coming.length ? Promise.all(coming.map(arrived)) : null;
}

/**
 * What a page built now waits for before it's seen: its view's ready and its Tintas' drawing (ui.charactersReady: only before Tinta's
 * drawing has come), together, READY_WAIT at most; null when there's nothing to wait for. pictures: its pictures on the screen too
 * (picturesComing), for a move with no slide, where the page that left stays on the screen meanwhile. Never before a slide: a press waited up
 * to 400 ms for Appearance's theme tiles before its slide began, where they come in during the slide.
 */
function pageReady(host, ready, { pictures = false } = {}) {
  const waits = [ready, ui.charactersReady(host), pictures ? picturesComing(host) : null].filter(Boolean);
  if (!waits.length) return null;
  return Promise.race([Promise.all(waits.map((wait) => Promise.resolve(wait).catch(() => {}))), new Promise((resolve) => setTimeout(resolve, READY_WAIT))]);
}

/**
 * place: the view's own (view.place), to put the page where it opens (a card it was opened at) before it's first seen.
 * held: makes a picture of the page that just left (null when nothing was on the screen before: the app's first page). Coming from another page,
 * the page that left stays on the screen as that picture while this one composes, and this one takes its place in a single frame, the picture
 * going in the same task: never a frame of neither (a tab's first visit, a link to another tab's page, were blank until the new page faded in
 * from nothing). Only the app's first page fades in.
 */
function reveal(host, ready, place, held = null) {
  host.setAttribute("data-waiting", "");
  let shot = null;
  const show = () => {
    if (!host.hasAttribute("data-waiting")) return;
    place?.();
    shown(host);
    if (shot) {
      shot.remove();
      if (state.pending === shot) state.pending = null;
    } else if (!held && host.isConnected) motion.appear(host, { rise: 0, blur: 0, duration: motion.duration("--dur-150", 150) });
  };
  const waiting = pageReady(host, ready, { pictures: true });
  if (!waiting) return show();
  shot = held?.() ?? null;
  // (A move that comes before this one shows takes the picture away with it: render's state.pending.)
  if (shot) state.pending = shot;
  waiting.then(show);
}

/**
 * A page the router held, shown now (data-waiting off): marked data-fresh until the frame that first shows it has been drawn, so lx/ui.js's
 * onScreenNow takes it as not on the screen yet and what arrives meanwhile is simply in that first frame. (On a slow phone that frame is drawn
 * a while after the page is shown; a card or a drawing that came in between took its held place's place and faded up from nothing, a first
 * frame with neither: 8 Nov.) The mark goes in a task posted from that frame's animation frame, which runs once the frame has been drawn. Only
 * a page that was held: one kept and shown again is never marked.
 */
function shown(host) {
  if (!host.hasAttribute("data-waiting")) return;
  host.removeAttribute("data-waiting");
  host.setAttribute("data-fresh", "");
  requestAnimationFrame(() => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => host.removeAttribute("data-fresh");
    port2.postMessage(null);
  });
}

/**
 * Draws a route's page into `host`. Returns its view: { title, back?, dispose?, refresh?, hide?, ready?, place? }. ready: resolves once the page is
 * composed (everything the device has drawn; only what waits on the network held in its place); the shell keeps it unseen until then (READY_WAIT
 * at most). place(): puts the page where it opens when that isn't its top (a card it was opened at), called while it's still unseen, right
 * before its first frame, so it never shows its top first and then scrolls.
 */
function build(host, tab, rest, params, { inSession, inBook }) {
  if (tab === "study") return renderStudy(host, inSession ? (params.from === "path" ? ["path"] : []) : rest, params);
  if (tab === "read") return renderRead(host, inBook ? [] : rest);
  if (tab === "settings") return renderSettings(host, rest, ctx, params);
  if (tab === "today") return renderToday(host, { onTranslate });
  if (tab === "know") return renderKnow(host, rest, { asTab: true });
  if (tab === "ai") return renderAi(host, rest);
  // Practice waits for an AI, so with none connected the section's own page takes its place (what you already did stays). A key of
  // your own on this device (ai/own-key.js) is an AI here: Practice runs on it.
  // Practice opens with an AI connected, a key of yours on this device, or the plan's in-app AI (ai/hosted.js).
  if (tab === "practice" && !aiConnected() && !ownKeyPresent() && !hostedReady(keptMe()) && rest[0] !== "past") return renderAi(host, []);
  if (tab === "practice") return renderPractice(host, rest, app, { base: "#practice", back: { href: "#ai", label: "AI" } });
  if (tab === "explore") return renderExplore(host, rest, params);
  return { title: renderTodo(host, tab) };
}

// Translate's page in the app's frame: the tabs and the header's language and settings step away, and the header holds
// the way back (shell.css :root[data-translate]).
function translateFrame(open) {
  if (Boolean(state.translating) === open) return;
  state.translating = open;
  document.documentElement.toggleAttribute("data-translate", open);
  if (open) setHeader("Translate", { href: "#today", label: "Home", title: "Translate" });
  else if (state.view) {
    setHeader(state.view.view.title, state.view.view.back);
    // Today where it was left.
    if (state.todayScroll) page.scrollTop = state.todayScroll;
    state.todayScroll = 0;
  }
  document.title = `${open ? "Translate" : (state.view?.view.title ?? "Home")} · Lexicommons`;
}

/**
 * Translate's page opening or closing from the page itself (the first thing typed, the field cleared), in that same
 * moment: the frame changes now and the address follows. A swipe back shows Today as it was.
 */
function onTranslate(open) {
  const onRoute = /^#\/?today\/translate(?=[/?]|$)/.test(location.hash);
  if (open) {
    if (!onRoute) {
      nav.pictures[nav.i] = { host: copyOf(state.view.host), scroll: page.scrollTop };
      nav.scrolls[nav.i] = page.scrollTop;
      state.todayScroll = page.scrollTop;
      location.hash = "#today/translate";
    }
    translateFrame(true);
  } else {
    translateFrame(false);
    if (onRoute) goBackTo("#today");
  }
}

/**
 * Draws the route's page. kind: how the app got here ("push": deeper, a new entry; "pop": back), which a move between
 * two pages of one tab slides by (page-slide.js); from: the entry it left; replaced: back took this entry's place.
 */
/** A swipe back's picture goes once the page under it is where the picture had it: a page drawn just now may not be tall enough yet to be
 * scrolled there (the path is a long one), and the picture going first showed its top for a frame or two. A few frames at most. */
function settleWhereItWas(entry, target) {
  let tries = 0;
  const check = () => {
    if (state.view !== entry || target === undefined || Math.abs(page.scrollTop - target) <= 1 || ++tries > 30) return void swipe?.settle();
    page.scrollTop = target;
    requestAnimationFrame(check);
  };
  check();
}

/** fn once the next frame is on the screen (a frame's callbacks run before its paint, and a task queued from one runs after it). */
const afterPaint = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));

// An iPhone or an iPad animates a back it makes itself (its own swipe from the edge): the page has already moved by the time the router hears of
// it. The app's slide for that back on top of the phone's was a second move: the screen jumped right, then left (6 Nov 2026, Settings → Reminders,
// a swipe back). (iPadOS says Macintosh, with touch.)
const PHONE_ANIMATES_ITS_BACK = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * system: a back or forward the app didn't make (the phone's own). On a phone that animates its own moves, that move is already made: no
 * slide, no cover rising or going down.
 */
function render(force = false, { kind = null, from = nav.i, replaced = false, system = false } = {}) {
  const { tab, rest, params, path } = parseRoute();
  // Settings itself on a wide screen: its first page, in this entry's place (SPLIT).
  if (tab === "settings" && !rest.length && SPLIT.matches) {
    history.replaceState({ ...(history.state ?? {}), lx: { i: nav.i } }, "", "#settings/account");
    nav.routes[nav.i] = "#settings/account";
    return render(force, { kind, from, replaced: true, system });
  }
  // A swipe back that went: the page it moved off the screen is put back once the route is drawn, whichever way that goes.
  const swiped = state.swiping;
  let swipePlaced = false;
  const inSession = tab === "study" && rest[0] === "session";
  const inBook = tab === "read" && rest[0] === "book" && Boolean(rest[1]);
  const inTranslate = tab === "today" && rest[0] === "translate";
  // A session sits over the Study page (a text over the Read page), so they share its key: opening one doesn't
  // rebuild the page. Translate's page is Today's own, everything else away (translate/page.js): the same field, so
  // the keyboard never drops.
  // Know draws as a tab of its own or as a page under Today (Settings → Appearance), so which it is goes in its key.
  const asTab = "";
  // A session started from the path (?from=path) sits over the path itself, so it shares the path's key: the path stays under it, as it was.
  const overPath = inSession && params.from === "path";
  // (Study's own page is "study/?": a session's key is that, so Study stays as it was under it, scrolled where you were. It was "study/", and
  // every session built Study again under it and again after it, at its top: 6 Nov 2026, in and out of a game after scrolling jumped.)
  const key = overPath ? "study/path?" : inSession ? "study/?" : inBook ? "read/?" : inTranslate ? "today/?" : `${path}?${new URLSearchParams(params)}${asTab}`;
  if (tab !== "settings") {
    // (The AI section with no tab of its own lives under Settings: Settings' Back still goes to the tab you came from.)
    if (tabOf(tab) !== "settings") {
      state.lastTab = inSession ? "#study" : inBook ? "#read" : `#${tab}`;
      state.lastTabName = PAGES[tab] ?? "Home";
      state.lastScreen = `/app/#${path}`;
    }
  }
  // Whether a session or a book was over the page as this began (a move from under one never slides).
  const wasOver = Boolean(state.session || state.reader);
  // Leaving a session by the route (Back, the phone's back): the page kept under it shows the new numbers, drawn again in place. A back the
  // phone made and animated itself (its swipe from the edge) has already shown that page: the session goes in this frame, never slid down
  // over it (8 Nov 2026).
  if (!inSession && state.session) {
    closeSession({ now: system && PHONE_ANIMATES_ITS_BACK });
    force = true;
  }
  // A book closed by the route (the browser's or the phone's back) leaves the Read page as it was before the book was
  // opened, kept and read in: drawn again, as the reader's own Back does.
  const leftBook = !inBook && Boolean(state.reader);
  if (!inBook) closeBook();

  if (force || leftBook || state.view?.key !== key) {
    // The section's own background, if the look has one (a page can preview another's, as Settings → Images does).
    // The AI tab and Practice show Study's.
    theme.setSection(tab === "practice" || tab === "ai" ? "study" : tab);
    const changed = state.view?.key !== key;
    // Come to from another tab (a tab tapped, a link to another tab's page).
    const fromAnotherTab = changed && Boolean(state.view) && tabOf(state.view.tab) !== tabOf(tab);
    // The same page drawn again (a session closed over it), when it has a quieter way than being built again: it stays, and draws itself again where
    // it's scrolled to. (Built again, it showed nothing until it was drawn: the path, coming back from a lesson, was black for a moment.)
    const redrawsItself = !changed && !leftBook && Boolean(state.view?.view?.refresh) && views.get(state.view.tab) !== state.view;
    // The page leaving: a tab's own page is kept as it is (where it's scrolled to as well), off the screen; any other
    // stops following what it listened to and goes. One drawn again in place (the same route, forced) goes too.
    const leaving = state.view?.host && !redrawsItself ? state.view : null;
    const leavingKept = Boolean(leaving) && views.get(leaving.tab) === leaving;
    // Between two pages of one tab, not from under a session or a book, nor after a swipe back (it drew the move), the
    // pages slide; anything else comes in as before.
    state.pending?.remove();
    state.pending = null;
    const afterSwipe = state.swiping;
    state.swiping = false;
    // (Settings' pages beside its menu change in place, as a computer's do.)
    const slideKind = changed && kind && !afterSwipe && !wasOver && leaving && !inSession && !inBook && motion.motionOn() && !(system && PHONE_ANIMATES_ITS_BACK) && !(tab === "settings" && SPLIT.matches) &&
      (leaving.tab === "settings" ? "settings" : tabOf(leaving.tab)) === (tab === "settings" ? "settings" : tabOf(tab)) ? kind : null;
    // A picture of the page leaving, made only if the arriving one has to be waited for (reveal's held): from its host as it was, in this task.
    let held = null;
    if (leaving && (changed || !leavingKept)) {
      const left = { host: leaving.host, scroll: page.scrollTop };
      held = () => picture(page, left.host, left.scroll);
      leaving.scroll = page.scrollTop;
      if (changed && !replaced) {
        // Where this entry's page was (back puts it there again), and a picture of it (a swipe back shows it).
        nav.scrolls[from] = page.scrollTop;
        nav.pictures[from] = { host: copyOf(leaving.host), scroll: page.scrollTop };
        for (const k of Object.keys(nav.pictures)) if (Number(k) < nav.i - 3) delete nav.pictures[k];
      }
      if (slideKind) state.pending = picture(page, leaving.host, page.scrollTop);
      leaving.host.remove();
      // A kept page stops following what it needn't while it's off the screen (the AI tab's live requests).
      if (leavingKept) leaving.view.hide?.();
      else leaving.view.dispose?.();
    }
    // A tab's own page (no sub-page), and the pages a session or a book open over: kept while you're elsewhere.
    // (Not the path under a session started from it: that's the path's own page, not Study's, and it draws itself again when the session's over.)
    const kept = KEPT_TABS.has(tab) && ((inSession && !overPath) || inBook || inTranslate || rest.length === 0);
    let entry = redrawsItself ? state.view : kept ? views.get(tab) : null;
    if (entry && entry.key !== key) {
      entry.view.dispose?.();
      entry.host.remove();
      views.delete(tab);
      entry = null;
    }
    let built = false;
    if (entry && !changed && force && !entry.view.refresh) {
      // Asked to draw it again (a session or a book closed over it), and it has no quieter way: built again.
      entry.view.dispose?.();
      entry.host.remove();
      views.delete(tab);
      entry = null;
    }
    if (!entry) {
      const host = el("div", { class: "lx-view" });
      page.append(host);
      entry = { key, tab, host, scroll: 0, view: build(host, tab, rest, params, { inSession, inBook }) };
      // Read with no tab of its own is a page under Home, with its way back.
      if (tab === "read" && !entry.view.back) entry.view.back = { href: "#today", label: "Home" };
      if (kept) views.set(tab, entry);
      built = true;
    } else {
      if (!entry.host.isConnected) page.append(entry.host);
      // Back as it was at once; whatever changed meanwhile comes in quietly. From another tab, that's after the frame that shows it: a tab is back at
      // the press, and bringing it up to date (Home working out what's next, say) never holds that frame.
      // A page whose data changed while you were away (view.stale) is brought up to date at once, before that frame: never a frame of what it was.
      if (fromAnotherTab && !entry.view.stale?.()) afterPaint(() => state.view === entry && entry.host.isConnected && entry.view.refresh?.());
      else entry.view.refresh?.({ now: true });
    }
    state.view = entry;
    // (The page under a session or a book: its own.)
    if (WIDE_PAGES.has(overPath ? "study/path" : inSession ? "study" : inBook ? "read" : inTranslate ? "today" : [tab, ...rest].join("/"))) app.setAttribute("data-column", "wide");
    else app.removeAttribute("data-column");
    placeAside(tab === "settings" && SPLIT.matches, rest);
    setHeader(entry.view.title, entry.view.back);
    setTabs(tab === "settings" ? "settings" : tabOf(tab));
    document.title = `${entry.view.title} · Lexicommons`;
    if (changed && !inSession && !inBook) {
      // The page scrolls in its own area (shell.css): a page kept goes back to where it was, a new one to the top, and
      // one gone back to where it was left (this entry's scroll).
      page.scrollTop = built ? 0 : entry.scroll;
      followBar();
      const restore = built && kind === "pop" && !replaced ? nav.scrolls[nav.i] : undefined;
      const leavingPicture = state.pending;
      // In place, scrolled, then slid in (or simply there): the swipe's picture goes once the real page is under it.
      swipePlaced = afterSwipe;
      // A back with no slide (animations off, or into another tab's page) waiting for its page: the page that left stays as a picture till then.
      let holding = null;
      const place = () => {
        if (state.view !== entry) {
          if (afterSwipe) swipe?.settle(); // drawn over already (another route, a redraw): the swipe's page still goes back in place
          return;
        }
        if (state.pending === leavingPicture) state.pending = null;
        if (holding) {
          holding.remove();
          if (state.pending === holding) state.pending = null;
        }
        shown(entry.host);
        // Where it opens, in this same task, before its first frame: where it was left (a back), or where the page itself says (view.place: a card
        // it was opened at).
        if (restore !== undefined) page.scrollTop = restore;
        else if (built) entry.view.place?.();
        followBar();
        if (slideKind && leavingPicture) slidePage(slideKind, { page, host: entry.host, leaving: leavingPicture });
        if (afterSwipe) settleWhereItWas(entry, restore);
      };
      if (built && (slideKind || restore !== undefined || afterSwipe)) {
        // Held unseen until it's drawn (as reveal does: its ready and its Tintas, 400 ms at most), the page that left still showing.
        entry.host.setAttribute("data-waiting", "");
        const waiting = pageReady(entry.host, entry.view.ready, { pictures: !slideKind && !afterSwipe });
        if (waiting && !slideKind && !afterSwipe && held) state.pending = holding = held();
        if (waiting) waiting.then(place);
        else place();
      } else if (built) reveal(entry.host, entry.view.ready, entry.view.place, held);
      else place();
    }
  }
  // Translate's page: open on its route, closed on Today's (a press on Back, the phone's back, a swipe). Coming back from
  // a page it opened (Find a pack), it's as it was.
  // A back (or forward) the phone made and animated itself has already shown where the box ends up: it's there, with no flight of the app's after it.
  if (tab === "today") state.view?.view?.translate?.(inTranslate, { still: swiped || (system && PHONE_ANIMATES_ITS_BACK) });
  translateFrame(inTranslate);
  if (tab === "today" && !inTranslate && state.swiping) {
    state.swiping = false;
    swipe?.settle();
  }
  // Nothing else here put it back (no new page drawn, or a session or a book opened over it): now.
  if (swiped && !swipePlaced) {
    state.swiping = false;
    swipe?.settle();
  }
  // A different session's link while one is open replaces it.
  // The page under a session where it was when the session opened: opening one can shorten how far the page scrolls (the tab bar goes), and it
  // came back higher than it was left (6 Nov 2026). Put back once that page is in view again.
  if (inSession && !state.session) state.under = { key: state.view?.key, y: page.scrollTop };
  if (inSession && (!state.session || state.sessionRoute !== rest.join("/"))) openSession(rest, params, system && PHONE_ANIMATES_ITS_BACK ? "now" : undefined);
  if (inBook && state.bookId !== rest[1]) openBook(rest[1]);
  if (!inSession && state.under) {
    if (state.view?.key === state.under.key && Math.abs(page.scrollTop - state.under.y) > 1) page.scrollTop = state.under.y;
    state.under = null;
  }
}

const ctx = {
  get me() {
    return state.me;
  },
  get lastTab() {
    return state.lastTab;
  },
  get lastTabName() {
    return state.lastTabName;
  },
  get lastScreen() {
    return state.lastScreen;
  },
  installPrompt: () => state.installPrompt,
  setUser(user) {
    state.me.user = user;
    const button = header.querySelector('[data-part="settings-button"]');
    if (button) button.textContent = initials(user.name);
  },
};

// Tapping the tab you're on, as iOS does: its page scrolls back to the top (at once when animations are off); at the
// top already, a page under the tab goes to the tab's own page; the tab's own page at its top stays as it is.
function followTabTaps() {
  app.addEventListener("click", (event) => {
    const link = event.target.closest?.('[data-part="tab-bar"] [data-part="tab"][data-state="active"]');
    if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (page.scrollTop > 1) {
      event.preventDefault();
      page.scrollTo({ top: 0, behavior: motion.motionOn() ? "smooth" : "auto" });
      return;
    }
    const { tab, rest } = parseRoute();
    event.preventDefault();
    // A page under the tab goes back to the tab's own page (a pop, as a back would).
    if (!(rest.length === 0 && `#${tab}` === link.getAttribute("href"))) goBackTo(link.getAttribute("href"));
  });
}

// A page's Back (the header's) goes back: to the page before in the app's history when it's the one it names, else in
// this entry's place (goBackTo).
function followBackLinks() {
  app.addEventListener("click", (event) => {
    const link = event.target.closest?.('[data-part="app-back"]');
    if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goBackTo(link.getAttribute("href"));
  });
}

// Typing: while a field has focus and the keyboard covers part of the screen (the visual viewport is short of the
// layout's), the app takes the screen above the keys and the tab bar steps aside (shell.css :root[data-keyboard]).
const KEYS_AT_LEAST = 40; // px of screen they take: past it, there are keys (a hardware keyboard's bar too)
const TYPED = "input:not([type='checkbox'], [type='radio'], [type='range'], [type='button'], [type='submit'], [type='file']), textarea, [contenteditable='true']";
function followKeyboard() {
  const vv = globalThis.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const typing = () => Boolean(document.activeElement?.matches?.(TYPED));
  // The screen without keys. Measured while nothing's being typed and kept while something is: innerHeight alone won't do, since
  // on iOS 26 it shrinks with the keyboard when the page is scrolled, and the keys then look like nothing at all.
  let full = 0;
  let fullWidth = 0;
  // A field the keys would cover scrolls in its own scroller, by what it takes and no more. One clear of them doesn't move.
  const reveal = () => {
    const field = document.activeElement;
    if (!field?.matches?.(TYPED) || field.closest(".lx-sheet-layer")) return;
    let scroller = field.parentElement;
    while (scroller && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller || scroller === root || scroller === document.body) return;
    const pad = 12;
    const bottom = Math.min(scroller.getBoundingClientRect().bottom, vv.offsetTop + vv.height);
    const box = field.getBoundingClientRect();
    if (box.bottom > bottom - pad) scroller.scrollTop += box.bottom - (bottom - pad);
  };
  const update = () => {
    const now = typing();
    if (!now || vv.width !== fullWidth || !full) {
      full = Math.max(innerHeight, vv.height + vv.offsetTop);
      fullWidth = vv.width;
    }
    const open = now && full - vv.height > KEYS_AT_LEAST;
    const was = root.hasAttribute("data-keyboard");
    root.toggleAttribute("data-keyboard", open);
    if (open) {
      root.style.setProperty("--lx-vv-height", `${Math.round(vv.height)}px`);
      root.style.setProperty("--lx-vv-top", `${Math.round(vv.offsetTop)}px`);
      if (!was) requestAnimationFrame(reveal);
    }
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  addEventListener("focusin", () => {
    // (A button taking the focus is focusout's, below.)
    if (!typing()) return;
    // Looked at in the next frame, before its layout, as reveal always was: read in the focus's own task, the screen's numbers laid out there
    // whatever the focus had just changed (Translate opening: 21 ms of CPU at 4×, 8 Nov 2026). No phone's keys are up at this moment, and a
    // field taking over from another with them up keeps them (focusout's settle).
    requestAnimationFrame(() => {
      update();
      reveal();
    });
  });
  // Focus going to another field passes through nothing focused: looked at once it has landed. And a press on a button takes the
  // focus before its own click: the layout mustn't move out from under that click, so it waits for it, however briefly.
  let pressing = false;
  let waiting = 0;
  const settle = () => {
    clearTimeout(waiting);
    waiting = 0;
    update();
  };
  addEventListener("pointerdown", () => (pressing = true), true);
  addEventListener("pointercancel", () => (pressing = false), true);
  addEventListener("click", () => {
    pressing = false;
    if (waiting) settle();
  });
  addEventListener("focusout", () => {
    clearTimeout(waiting);
    waiting = setTimeout(settle, pressing ? 150 : 0);
  });
  // The top of the app stays at the top of the screen. iOS scrolls the whole page to reveal a field it thinks the keys cover,
  // the app's own frame with it, though the page doesn't scroll anywhere else. A press on a field focuses it without that, and
  // anything that still scrolls it (the keyboard's arrows between fields, typing) is put back at once.
  const stayPut = () => {
    if (scrollY || root.scrollTop) scrollTo(0, 0);
  };
  addEventListener("scroll", stayPut, { passive: true });
  vv.addEventListener("scroll", stayPut);
  vv.addEventListener("resize", stayPut);
  if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))) {
    let press = null;
    addEventListener(
      "touchstart",
      (event) => {
        const touch = event.changedTouches[0];
        press = { x: touch.clientX, y: touch.clientY, at: performance.now() };
      },
      { capture: true, passive: true },
    );
    addEventListener(
      "touchend",
      (event) => {
        const field = event.target?.closest?.(TYPED);
        const touch = event.changedTouches[0];
        if (!field || field.disabled || field.readOnly || !press) return;
        // A scroll that began on a field, or a long press for the selection's menu, stays the phone's.
        if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 10 || performance.now() - press.at > 500) return;
        // With the keys already up, a tap puts the caret where it landed.
        if (field === document.activeElement && root.hasAttribute("data-keyboard")) return;
        event.preventDefault();
        // (A field focused from code has no keys: only a press brings them.)
        if (field === document.activeElement) field.blur();
        field.focus({ preventScroll: true });
      },
      { capture: true, passive: false },
    );
  }
  update();
}

// The app's frame at once, from what this device knows (the tab's name and the tabs; the account's initials come with
// the account), so a start shows the app rather than a line of text, and the page comes in whole when its data is in.
function drawFrame() {
  const { tab, rest } = parseRoute();
  setHeader(tab !== "settings" && rest.length === 0 ? (PAGES[tab] ?? "") : "");
  setTabs(tab === "settings" ? "settings" : tabOf(tab));
  app.append(...frameParts());
  document.getElementById("root").replaceChildren(app);
}

// The interface's language (lx/i18n.js, set by Settings → Language: shell/interface-language.js): <html lang> and dir follow it.
function startLocale() {
  document.documentElement.lang = htmlLang();
  if (htmlDir() === "rtl") document.documentElement.dir = "rtl";
  else document.documentElement.removeAttribute("dir");
}

/** How long a start waits for the frequency list beside the evidence (ms): it's usually the service worker's copy, in a few. */
const FREQUENCY_WAIT = 300;
/** How long a start waits for Tinta's drawing beside the evidence (ms): the service worker's copy, in a few; a first open's, from the network. */
const TINTA_WAIT = 3000;

async function start() {
  // Tinta's drawing (character/character.js and its rig), from the start's first moment: a page drawn before it came showed Tinta's place
  // empty, then Tinta a moment later. Waited for below, beside the evidence.
  const tintaComing = ui.characterReady();
  // The app's words in the language set for them, from the copy this device keeps; one slow to come waits a second at most, and the page
  // is drawn again when it arrives (onInterfaceShown below).
  await Promise.race([applyInterface().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
  startLocale();
  // A device that may be new (no first run done, no language): the frame waits until the start knows, so a first run comes in whole over
  // it rather than over an empty Home a moment first (7 Nov, a new learner's walk). Meanwhile the canvas, and Loading past a second.
  const held = mayNeedWelcome();
  if (!held) drawFrame();
  followKeyboard();
  followTabTaps();
  followBackLinks();
  // This entry's place in the app's history (nav), kept across a reload.
  history.scrollRestoration = "manual";
  const at = history.state?.lx?.i;
  if (typeof at === "number") nav.i = at;
  else history.replaceState({ ...(history.state ?? {}), lx: { i: 0 } }, "");
  nav.routes[nav.i] = routeOf(location.hash);
  // A tab pressed while the app is still starting: the frame and its tabs are up at once, the router's listeners only once the account is in
  // (below). Its entry gets its place now, so the record and the browser stay in step; the page it names is drawn when the start is done. A
  // back meanwhile moves the record with the browser.
  const starting = () => {
    const at = history.state?.lx?.i;
    if (typeof at === "number") {
      nav.i = at;
    } else {
      nav.i += 1;
      history.replaceState({ ...(history.state ?? {}), lx: { i: nav.i } }, "");
      nav.routes.length = nav.i;
    }
    nav.routes[nav.i] = routeOf(location.hash);
  };
  addEventListener("hashchange", starting);
  addEventListener("popstate", starting);
  // The swipe back: in the app installed on a phone's home screen (a browser's tab has its own edge swipe).
  const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const checking = () => {
    try {
      return localStorage.getItem("check.swipe-back") === "1";
    } catch {
      return false;
    }
  };
  swipe = followSwipeBack({
    page,
    enabled: () => (installed() || checking()) && !noAppSwipe && !systemSwipes() && !afresh && !state.session && !state.reader && !document.documentElement.hasAttribute("data-scroll-lock") && !document.documentElement.hasAttribute("data-keyboard"),
    underneath: () => {
      // Only to the page you came from in this tab, never back into a session or a book (backEntry): closing one goes to its page as a new
      // entry, so the entry before is the session (or the book) you've finished, and going back there opens it again.
      const before = backEntry();
      const shot = before && nav.pictures[before.i];
      if (!shot || tabOfRoute(before.route) !== tabOfRoute(nav.routes[nav.i])) return null;
      swipeFrom = nav.i;
      // Back from Translate, Home as it will be: Translate leaves its box empty (translate/page.js), so the picture's is too.
      const prepare = nav.routes[nav.i] === "#today/translate" ? (copy) => {
        for (const field of copy.querySelectorAll('[data-part="translate-field"]')) {
          field.removeAttribute("data-has-text");
          for (const text of field.querySelectorAll("textarea, input")) text.value = "";
        }
      } : undefined;
      return picture(page, shot.host, shot.scroll, { prepare });
    },
    back: () => {
      // One gesture, one step: anything that already went back (the phone's own swipe) leaves only the page to put in place.
      if (nav.i !== swipeFrom || afresh) return void swipe?.settle();
      state.swiping = true;
      appBack = true;
      swipeWent = { at: performance.now(), to: nav.i - 1 };
      history.back();
    },
    // From Translate (where the tabs step aside), the tabs come in with the page underneath, as far as it has come.
    onMove: (p, { duration = 0 } = {}) => {
      const root = document.documentElement;
      if (p === null || !root.hasAttribute("data-translate")) {
        root.removeAttribute("data-swipe-back");
        tabBar.style.removeProperty("opacity");
        tabBar.style.removeProperty("transition");
        return;
      }
      root.setAttribute("data-swipe-back", "");
      tabBar.style.transition = duration ? `opacity ${duration}ms linear` : "none";
      tabBar.style.opacity = String(p);
    },
  });
  await theme.initTheme();
  // (Which recordings of your packs are on this device, so they play at once: study/clips.js.)
  // Who you are: the server's answer, or with no network the last one kept on this device (api.js whoAmI).
  // The word index's kept snapshot comes with the evidence, so a start reads it instead of replaying the evidence (know/word-index.js).
  // The language's frequency list comes with them too: Home's first plan orders new words by it, and a list arriving after that draw had the
  // path laid out again (a second long task at a year's learner on a slowed phone, 6 Nov 2026). It's waited for FREQUENCY_WAIT ms at most, so a
  // slow or missing list never holds the start: it arrives in the background, as before.
  const listFirst = Promise.race([loadFrequency(learning()), new Promise((resolve) => setTimeout(resolve, FREQUENCY_WAIT))]);
  // What the plan works out from the study material, kept from the start before (study/plan-kept.js), comes with them too.
  // Tinta's drawing too, so every page's Tinta is drawn in the frame the page goes in: TINTA_WAIT ms at most, and past that a page's Tinta
  // holds its place with its kept first frame (character/firsts.js) until it comes.
  const tintaFirst = Promise.race([tintaComing.catch(() => {}), new Promise((resolve) => setTimeout(resolve, TINTA_WAIT))]);
  const [me] = await Promise.all([whoAmI(), loadProgress(), loadPacks(), loadClips(), loadWordIndex(), loadPlanKept(), listFirst, tintaFirst]);
  state.me = me;
  rememberProviders(me.stores);
  setAiConnected(me.aiConnected);
  checkKeyPresence(me).catch(() => {});
  // Explore's home as last seen is this account's own (explore/home-data.js).
  setExploreAccount(me.user.id);
  // Public packs (the starter first) from the open library, in the background: studying starts on what this device has.
  // On a first run, once it's known which language: a device learning Spanish has no use for Dutch's word bands (welcome.js).
  if (!needsWelcome()) syncLibraryPacks();
  // The two flags every screen shows, loaded ahead: a page that has them draws them in its first frame (ui.languageFlag).
  ui.warmFlags([learning(), learningFrom()]);
  // The account's own: what your AI's requests were (ai/client.js), as Explore's home (above).
  setAiAccount(me.user.id);
  app.replaceChildren(...frameParts());
  // Undo toasts, safe mode, and undoing a look that would hide the app.
  watchLook(app);
  // Your AI's changes to your packs, from the relay (study/pack-inbox.js), each shown with Undo.
  startPackInbox({
    account: state.me.user.id,
    aiConnected,
    onAiChange: onLayoutChange,
    notify: (meaning, text, undo) =>
      lookToast(meaning, text, {
        undo:
          undo &&
          (async () => {
            const result = await undo();
            if (!result.ok) throw new Error(result.error);
          }),
      }),
  });
  // Your own storage (Settings → Storage), when one is connected: what's yours, the same on every device (sync.js).
  startSync({ account: state.me.user.id });
  // Reminders on this device (push.js): the badge clears, and the device's report goes out when they're on.
  startReminders();
  // While an AI is connected, what you study goes to where it can read it (ai/study-record.js); with none, nothing does.
  startStudyRecord();
  // Back or forward to an entry with the same address as this one (a page that put another's address in its place) fires no
  // hashchange: the app's place in its history goes with it all the same.
  // The start is done: the router's own listeners take over from the start's.
  removeEventListener("hashchange", starting);
  removeEventListener("popstate", starting);
  // The app's own step arriving on an entry that lost its place (goingTo): placed again, as the entry the step went to, before anything reads
  // it (else it's taken for a page pressed meanwhile, and gone to again after the step). Kept until the step arrives (the page it left can
  // still have its second event to come: a new entry fires popstate and hashchange), for 3 s at most. Returns this entry's place.
  const placeArrival = () => {
    let at = history.state?.lx?.i;
    if (goingTo && performance.now() - goingTo.at > 3000) goingTo = null;
    // (Not a link's own new entry, pressed since the step began: pressedLink.)
    const linked = Boolean(goingTo && pressedLink && pressedLink.at >= goingTo.at && (location.hash || "#today") === pressedLink.href);
    if (typeof at !== "number" && goingTo && history.length === goingTo.length && !linked) {
      at = goingTo.i;
      history.replaceState({ ...(history.state ?? {}), lx: { i: at } }, "");
    }
    if (goingTo && at === goingTo.i) goingTo = null;
    return at;
  };
  addEventListener("popstate", () => {
    placeArrival();
    // A page pressed while a tab's history is starting afresh (a new entry: no place yet), kept in case the step back drops it.
    if (afresh && typeof history.state?.lx?.i !== "number") afresh.pressed = location.hash;
    // The step back for a tab's history starting afresh, or the step forward past it: at once (a page pressed meanwhile can't come between).
    if ((afresh || passing >= 0) && typeof history.state?.lx?.i === "number") return void followEntry();
    setTimeout(() => {
      const at = history.state?.lx?.i;
      if (typeof at === "number" && at !== nav.i) followEntry();
    }, 60);
  });
  const followEntry = () => {
    const at = placeArrival();
    if (afresh && typeof at === "number") {
      // (The same step's other event, or a step already past: nothing to do.)
      if (afresh.overtaken === null && at !== afresh.expect) return;
      // A page pressed meanwhile can be in the history before its own hashchange has come: the history is longer than when this began.
      if (afresh.overtaken === null && history.length > afresh.length) afresh.overtaken = afresh.from + (history.length - afresh.length);
      // At the first entry for another tab's page: it becomes Home's, and the history steps on to the second, which becomes the tab's page.
      if (afresh.overtaken === null && afresh.phase === "first" && !afresh.home) {
        history.replaceState({ ...(history.state ?? {}), lx: { i: 0 } }, "", "#today");
        afresh.phase = "tab";
        afresh.expect = 1;
        return void stepTo(afresh.expect, at);
      }
      // The history's step back to its first entry, arriving: the tab's history starts afresh there. A page pressed meanwhile whose entry
      // the step back dropped (Chrome does) is gone to now, after the tab.
      if (afresh.overtaken === null) {
        const pressed = afresh.pressed;
        finishAfresh();
        if (pressed && routeOf(pressed) !== nav.routes[nav.i]) location.hash = pressed;
        return;
      }
      // It came after a page that was pressed first (below): forward again to that page, nothing drawn; this time the old entries stay.
      const to = afresh.overtaken;
      afresh = null;
      passing = to;
      setTimeout(() => passing === to && (passing = -1), 1000);
      return void stepTo(to, at);
    }
    // Passing back through on the way forward: nothing drawn until it's there (it's the page already on the screen).
    if (passing >= 0) {
      if (at === passing) return void (passing = -1);
      // There, at a page pressed meanwhile whose own hashchange hadn't come: followed below as the new entry it is.
      if (typeof at === "number") return;
      passing = -1;
    }
    const from = nav.i;
    const mine = appBack || state.swiping;
    appBack = false;
    const fresh = typeof at !== "number";
    let kind = null;
    if (typeof at !== "number") {
      // A new entry (a link, or the app going somewhere): one deeper; what was ahead of it is gone.
      nav.i = from + 1;
      history.replaceState({ ...(history.state ?? {}), lx: { i: nav.i } }, "");
      for (const list of [nav.routes, nav.scrolls, nav.pictures]) list.length = nav.i;
      kind = "push";
    } else {
      nav.i = at;
      kind = at < from ? "pop" : at > from ? "push" : null;
    }
    nav.routes[nav.i] = routeOf(location.hash);
    if (kind === "pop" && !mine) {
      // A back the app didn't make, while its swipe is going or just after it went back: the phone's own swipe. One gesture is one step.
      if (swipe?.active) {
        phoneHasItsOwnBack();
        swipe.drop();
      }
      else if (performance.now() - swipeWent.at < 900 && nav.i < swipeWent.to) {
        // (Not drawn: the page the swipe went to stays, and the history steps forward to it again.)
        phoneHasItsOwnBack();
        swipeWent = { at: -Infinity, to: -1 };
        appBack = true;
        return void history.forward();
      }
    }
    // A new entry before the step back came: the page you pressed is the one you're on (drawn as any new one); the step back, when it
    // comes, is undone (above). (5 Nov 2026: Home, then a page at once, lost the page to Home's address.)
    if (afresh && fresh) afresh.overtaken = nav.i;
    else if (fresh && isTabsOwnPage(nav.routes[nav.i]) && tabOfRoute(nav.routes[nav.i]) !== tabOfRoute(nav.routes[from] ?? "#today")) startAfresh();
    // The phone's own move: a step to an entry already made (back, or forward again) that the app didn't take (its steps are marked: appBack).
    render(false, { kind, from, system: !fresh && at !== from && !mine });
  };
  addEventListener("hashchange", followEntry);
  // A page that became another in this entry (route.js replaceRoute): drawn in place, the record following the address.
  addEventListener("lx-route-replaced", () => {
    nav.routes[nav.i] = routeOf(location.hash);
    render(false, { kind: null, from: nav.i, replaced: true });
  });
  // Which page has the third tab (Settings → Appearance): the tabs change at once.
  // An AI connected or let go changes the tab bar. It, or the third tab changing, changes the AI section's page too (what it
  // shows, and its way back): the one in view is drawn again, a kept one when it's next shown.
  let wasConnected = aiConnected();
  let wasThird = thirdTab();
  onLayoutChange(() => {
    const { tab, rest } = parseRoute();
    setTabs(tab === "settings" ? "settings" : tabOf(tab));
    if (aiConnected() === wasConnected && thirdTab() === wasThird) return;
    // An AI just connected works from the account's copies of your packs: they go now.
    if (aiConnected() && !wasConnected) checkPackInbox();
    wasConnected = aiConnected();
    wasThird = thirdTab();
    const kept = views.get("ai");
    if (kept && kept !== state.view) {
      kept.view.dispose?.();
      kept.host.remove();
      views.delete("ai");
    }
    // Not the Connection page: connecting is what it's for, and a token it has just made is shown once.
    if ((tab === "ai" && rest[0] !== "connect") || tab === "practice") render(true);
  });
  // Connecting happens in the AI's own app: coming back to this one, ask again (at most once a minute, or every time from the
  // pages about connecting one).
  let askedAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (parseRoute().tab !== "ai" && Date.now() - askedAt < 60_000) return;
    askedAt = Date.now();
    whoAmI().then((fresh) => setAiConnected(fresh.aiConnected)).catch(() => {});
  });
  // The language you're learning: the lang attribute and labels every builder gives its text (ui.js), and on a change
  // its frequency list and the page in view, in that language.
  const followLanguage = () => ui.setTargetLanguage(learning(), languageLabel(learning()), learningFrom(), languageLabel(learningFrom()));
  followLanguage();
  // Every page is in the old language: the one in view is drawn again, the kept ones when they're next shown.
  const drawAllAgain = () => {
    const shown = state.view;
    if (shown?.host && views.get(shown.tab) !== shown) {
      shown.view.dispose?.();
      shown.host.remove();
    }
    forgetViews();
    state.view = null;
    render(true);
  };
  onLearningChange(() => {
    followLanguage();
    loadFrequency(learning());
    drawAllAgain();
  });
  // The app's words in another language (Settings → Language, or Grow): the same, with <html lang> and dir.
  onInterfaceShown(() => {
    startLocale();
    drawAllAgain();
  });
  // A held start (above): its first run, whole, then the frame under it; or, a device that wasn't new after all, the frame with its page.
  if (held && needsWelcome()) await openWelcome({ whole: true });
  if (held) drawFrame();
  render(true);
  // A first run: what do you want to learn? (welcome.js.) #welcome opens it again, to look at.
  if (!document.querySelector(".lx-welcome") && (needsWelcome() || location.hash === "#welcome")) openWelcome();
  document.documentElement.setAttribute("data-app-ready", "");
  // When the app was ready, for whoever measures a start (performance.getEntriesByName("lx-app-ready")).
  performance.mark?.("lx-app-ready");
  appDrawn();
  // Which words of the language you're learning are most used (new words come in that order); fetched in the
  // background, fine without.
  loadFrequency(learning());
  // What a session's first step reads of the study material, worked out while the page is idle (study/warm-idle.js).
  warmWhileIdle();
}

if ("serviceWorker" in navigator) {
  const registration = navigator.serviceWorker.register("/sw.js").catch(() => null);
  // A new version while the app is open: looked for as it goes out of view and comes back, nothing on screen about it (Settings → About
  // says so), and taken as it comes back after a long time away when nothing would be lost (new-version.js).
  watchForUpdates(registration);
  // A first open: the worker takes the page once it's installed, after the page loaded what it needed without it. What
  // it loaded (theme-boot.js keeps every entry) goes to the worker to keep, so the app opens offline as it looked (the
  // language's flag, a script's font); every later open goes through the worker, which keeps what it fetches itself.
  if (!navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        // This site's files (a blob: carries the site's origin too, and is no file).
        const own = performance.getEntriesByType("resource").map((entry) => new URL(entry.name)).filter((url) => url.protocol === location.protocol && url.origin === location.origin);
        navigator.serviceWorker.controller?.postMessage({ keep: [...new Set(own.map((url) => url.pathname + url.search))] });
      },
      { once: true },
    );
}
start().catch((error) => {
  if (error instanceof SignedOut) return;
  console.error("[lexicommons] app start failed:", error);
  document.getElementById("root").replaceChildren(el("p", { class: "lx-start-error" }, `Lexicommons couldn't start: ${error.message}`));
});

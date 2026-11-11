// The public home page (index.html) in the visitor's language, when the app has it: the page is written in English, each piece
// marked data-t="<key>" (data-t-alt, data-t-content for an attribute), and a shipped locale's strings file puts its words in.
// English, or a language the app hasn't got, changes nothing, and lx/i18n.js is only fetched for a locale that's there. Its numbers
// come from js/site-facts.js, as the page's English does (scripts/site-facts.mjs).

const wanted = [...new Set((navigator.languages?.length ? navigator.languages : [navigator.language ?? "en"]).map((code) => String(code).split("-")[0].toLowerCase()))];

async function localize() {
  for (const code of wanted) {
    if (code === "en") return;
    if (!/^[a-z]{2,3}$/.test(code)) continue;
    const response = await fetch(`/i18n/${code}.json`).catch(() => null);
    if (!response?.ok) continue;
    const file = await response.json().catch(() => null);
    if (!file) continue;
    const [i18n, facts] = await Promise.all([import("./lx/i18n.js"), import("./site-facts.js")]);
    const read = i18n.readStrings(file);
    if (!read.strings.size) continue;
    i18n.setLocale(code, { strings: read.strings });
    document.documentElement.lang = i18n.htmlLang();
    document.documentElement.dir = i18n.htmlDir();
    // The page's numbers (js/site-facts.js), counted and formatted in the locale's own way.
    const values = facts.siteValues();
    for (const node of document.querySelectorAll("[data-t]")) node.textContent = i18n.t(node.dataset.t, values);
    for (const node of document.querySelectorAll("[data-t-alt]")) node.alt = i18n.t(node.dataset.tAlt, values);
    for (const node of document.querySelectorAll("[data-t-content]")) node.content = i18n.t(node.dataset.tContent, values);
    for (const node of document.querySelectorAll("[data-t-label]")) node.setAttribute("aria-label", i18n.t(node.dataset.tLabel, values));
    return;
  }
}
localize().catch(() => {});

// The home page's phones (index.html, .site-clip): each clip plays only while its phone is at least half in view, so one or two play at
// a time, and pauses when it leaves. Under reduced motion none plays and each shows its poster; the same with no script. Every phone's
// round button pauses (or plays) them all, kept for the visit.
// A clip is fetched whole the first time it's wanted and played from a blob: the site's static files answer a Range request with the
// whole file (measured on the live site, 9 Nov 2026), and Safari's media player plays no video from a server that does. The CSP's
// media-src allows blob:, and a clip is a few hundred KB.
const clips = [...document.querySelectorAll(".site-clip")];
const buttons = [...document.querySelectorAll(".site-pause")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const KEPT = "lx.site.paused";
let paused = false;
try {
  paused = sessionStorage.getItem(KEPT) === "1";
} catch {}
const inView = new Set();

const loading = new Map();
function load(clip) {
  if (!loading.has(clip)) {
    loading.set(clip, fetch(clip.dataset.src).then((response) => {
      if (!response.ok) throw new Error(`clip ${response.status}`);
      return response.blob();
    }).then((blob) => {
      clip.src = URL.createObjectURL(blob);
      // It starts where its poster was taken, so the poster turns into motion with no jump (frame 0 is the loop's join).
      clip.currentTime = Number(clip.dataset.start) || 0;
    }));
  }
  return loading.get(clip);
}

function settle() {
  const moving = !still.matches && !paused;
  for (const clip of clips) {
    if (moving && inView.has(clip)) {
      load(clip)
        .then(() => {
          // Still wanted once it's here (the visitor may have scrolled on, paused or asked for less motion meanwhile).
          if (!still.matches && !paused && inView.has(clip)) return clip.play();
        })
        .catch(() => {}); // a clip that can't load or play keeps its poster
    } else if (!clip.paused) clip.pause();
  }
  for (const button of buttons) {
    button.hidden = still.matches;
    button.setAttribute("aria-pressed", String(paused));
  }
}

if (clips.length && "IntersectionObserver" in window) {
  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) inView.add(entry.target);
        else inView.delete(entry.target);
      }
      settle();
    },
    { threshold: [0, 0.5, 1] },
  );
  for (const clip of clips) watch.observe(clip);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      paused = !paused;
      try {
        sessionStorage.setItem(KEPT, paused ? "1" : "0");
      } catch {}
      settle();
    });
  }
  still.addEventListener("change", settle);
  settle();
}

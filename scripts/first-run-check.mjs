// A first run, on a phone in Chrome: a brand-new account is asked one thing, what it wants to learn, before anything else (never which language it
// speaks: the app teaches from English alone, so that question went on 11 Nov 2026); it's gone at the press. A phone set to another language or
// to one nobody knows gets the same list; a device that said which it speaks, when that was asked, keeps its answer. The list and its search;
// a press making that language the one you're learning, its packs on their way and Home in that language, never asked again; a press while Tinta waves; an account that has already
// studied, and a device where a language was picked, never asked; a control that the check can fail. A press in the list to learn waits for the list
// the welcome shows once the catalog has answered (until then every language; on a server with only Dutch's packs, Dutch alone), with a control
// holding the catalog back. LOCAL only. node scripts/first-run-check.mjs http://localhost:<port> <outDir>
process.env.LX_FIRST_RUN = "1";
const { chromium } = await import("./quiet-browser.mjs");
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
if (!BASE || !outArg || !/^http:\/\/localhost/.test(BASE)) {
  console.error("Usage: first-run-check.mjs http://localhost:<port> <outDir> (LOCAL only: it signs up accounts)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const stage = async (name, run) => {
  try {
    const said = await run();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).slice(0, 400)}`);
  }
};

const browser = await chromium.launch({ headless: true, channel: "chrome" });
// languages: what the phone says it speaks (navigator.languages), en-US unless given; stored: localStorage set before the app runs.
// before(context): run before the app is opened (a route, say).
async function newAccount(name, { languages = null, stored = {}, before = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
  await context.addInitScript(
    ([languages, stored]) => {
      if (languages) {
        Object.defineProperty(Navigator.prototype, "languages", { get: () => languages, configurable: true });
        Object.defineProperty(Navigator.prototype, "language", { get: () => languages[0] ?? "", configurable: true });
      }
      for (const [key, value] of Object.entries(stored)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    [languages, stored],
  );
  if (before) await before(context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  return { context, page };
}
const welcome = ".lx-welcome";
// (Until 11 Nov 2026 a first question asked which language you speak. The app teaches from English alone, so nothing asks it now: SPOKE is
// the old question, which must never come up.)
const SPOKE = "Which language do you speak?";
const LEARN = "What do you want to learn?";
const titleOf = (page) => page.locator(`${welcome} [data-part="page-title"]`).textContent();
// The one question is up: what to learn (never which language is spoken).
async function onLearn(page) {
  await page.waitForSelector(welcome);
  const title = await titleOf(page);
  assert(title === LEARN && title !== SPOKE, `the first question is "${title}"`);
}
// The rows of the question that's up: [code, its name, its line under it].
const rowsOf = (page) =>
  page.locator(`${welcome} [data-language]`).evaluateAll((nodes) => nodes.map((n) => [n.dataset.language, n.querySelector(".lx-row-title")?.textContent ?? "", n.querySelector(".lx-row-sub")?.textContent ?? "", n.getAttribute("aria-current")]));
// Whether a language's packs arrive within `ms`. Polled inside the page: Playwright resolves a waitForFunction with an async predicate at once, so that wait can never fail.
const packCame = (page, code, ms) =>
  page.evaluate(
    async ([code, ms]) => {
      const { learning } = await import("/js/study/learning.js");
      // Through the module each time: content.js puts a new array in PACKS when it builds again (export let), so one taken out before
      // the language's pack came stays empty (this wait failed so on 7 Nov while the app had the pack).
      const content = await import("/js/study/content.js");
      for (let waited = 0; waited < ms; waited += 200) {
        if (learning() === code && content.PACKS.length) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    },
    [code, ms],
  );

// The list to learn from offers, once the catalog has answered, only the languages with a pack that isn't opt-in (welcome.js languageChoices);
// with no library, nothing's taken away (null). Until it answers, every language is shown: a row pressed then can be hidden by the time the press
// lands. Read here, not in the page, so a page whose catalog is held back (the control) can't hold this up.
async function offeredOf() {
  const packs = (await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({})))?.packs;
  if (!packs || typeof packs !== "object") return null;
  return Object.keys(packs).filter((code) => Array.isArray(packs[code]) && packs[code].some((pack) => !pack?.optIn));
}
/** The rows of the welcome's list that are shown now. */
const shownRows = (page) => page.locator(`${welcome} li:not([hidden]) [data-language]`).evaluateAll((nodes) => nodes.map((n) => n.dataset.language));
/** Waits (never past limit) until the list to learn shows only what the catalog offers and the language being learned (welcome.js take), as it
 *  does once the catalog has answered; the rows shown. */
async function settledList(page, limit = 10_000) {
  const offered = await offeredOf();
  if (offered)
    await page.waitForFunction(
      (offered) => {
        const shown = [...document.querySelectorAll(".lx-welcome li:not([hidden]) [data-language]")].map((n) => n.dataset.language);
        let learning = null;
        try {
          learning = JSON.parse(localStorage.getItem("lx.learning.v1") ?? "null")?.lang ?? null;
        } catch {}
        return shown.length > 0 && shown.every((code) => offered.includes(code) || code === learning);
      },
      offered,
      { timeout: limit },
    );
  return shownRows(page);
}
/** Presses the first of codes the settled list shows, else its first row, as a person would; the code pressed. */
async function pickToLearn(page, codes) {
  const shown = await settledList(page);
  const code = codes.find((c) => shown.includes(c)) ?? shown[0];
  await page.locator(`${welcome} [data-language="${code}"]`).click();
  return code;
}

const { context, page } = await newAccount("First Run", { languages: ["en-US", "nl-NL"] });
await stage("a brand-new account is asked one thing, what it wants to learn: never which language it speaks, and nothing kept or assumed about that", async () => {
  await onLearn(page);
  assert(!(await page.locator(`${welcome} .lx-welcome-said, ${welcome} .lx-welcome-change`).count()), "a line about the language spoken, or a way to change it");
  assert(!/speak/i.test(await page.locator(welcome).innerText()), `the first run says something about speaking: ${(await page.locator(welcome).innerText()).slice(0, 120)}`);
  const kept = await page.evaluate(() => localStorage.getItem("lx.interface.v1"));
  assert(kept === null, `something was kept about the language spoken: ${kept}`);
  // The phone's own languages (English and Dutch here) change nothing: Dutch is offered to learn, English isn't.
  const rows = await rowsOf(page);
  assert(rows.some(([code]) => code === "nl") && !rows.some(([code]) => code === "en"), `offered to learn: ${rows.slice(0, 6).map((r) => r[0]).join(", ")}…`);
  await page.screenshot({ path: join(OUT, "shots", "00-what-to-learn.png") });
  return `${rows.length} languages to learn, Dutch among them on a phone set to English and Dutch`;
});
await stage("a brand-new account is asked what it wants to learn, over everything", async () => {
  await page.waitForSelector(welcome);
  assert((await titleOf(page)) === LEARN, "its title");
  const box = await page.locator(welcome).boundingBox();
  assert(box.x === 0 && box.y === 0 && box.width === 390 && box.height === 844, `it doesn't cover the screen: ${JSON.stringify(box)}`);
  const over = await page.evaluate(() => { const at = document.elementFromPoint(195, 800); return Boolean(at?.closest(".lx-welcome")); });
  assert(over, "something's over it, where the tab bar would be");
  // The list is its own scroller; that it scrolls once it's long is the control's (every language up while the catalog is held back): once
  // the catalog has answered, a server with only Dutch's packs lists one row.
  const overflow = await page.locator(`${welcome} .lx-welcome-list`).evaluate((n) => getComputedStyle(n).overflowY);
  assert(/^(auto|scroll)$/.test(overflow), `the list can't scroll (overflow-y: ${overflow})`);
  await page.screenshot({ path: join(OUT, "shots", "01-first-run.png") });
  const count = await page.locator(`${welcome} [data-language]`).count();
  assert(count > 20, `only ${count} languages`);
  return `${count} languages in the list`;
});
// The list as it's laid out: its two headings, each group's codes in order, and each shown row's line under its name.
const groupsOf = (p) =>
  p.evaluate((sel) => {
    const out = { heads: [], full: [], rest: [], subs: {} };
    let group = null;
    for (const item of document.querySelectorAll(`${sel} .lx-language-list [data-part="list"] > li`)) {
      if (item.classList.contains("lx-language-head")) {
        group = item.getAttribute("data-group");
        if (!item.hidden) out.heads.push(item.textContent.trim());
        continue;
      }
      if (item.hidden) continue;
      const row = item.querySelector("[data-language]");
      out[group]?.push(row.dataset.language);
      const sub = row.querySelector(".lx-row-sub:not([hidden])")?.textContent ?? "";
      if (sub) out.subs[row.dataset.language] = sub;
    }
    return out;
  }, welcome);
// The languages with a full course, from the facts the list itself reads: the catalog's lesson counts against the site's own number for one.
const fullByTheFacts = (p) =>
  p.evaluate(async () => {
    const { SITE_FACTS } = await import("/js/site-facts.js");
    const packs = (await (await fetch("/library/catalogue.json")).json()).packs ?? {};
    const lessons = Object.fromEntries(Object.entries(packs).map(([code, list]) => [code, Math.max(0, ...list.map((pack) => Number(pack?.lessons) || 0))]));
    return { need: SITE_FACTS.fullCourse, lessons, full: Object.keys(lessons).filter((code) => lessons[code] >= SITE_FACTS.fullCourse && code !== "en") };
  });
await stage("the languages with a full course lead the list under Full courses, each with its lessons, from the catalog's own counts; every other under First lessons, by name", async () => {
  await settledList(page);
  const facts = await fullByTheFacts(page);
  if (!facts.full.length) return "no full course on this server's catalog: nothing to lead";
  const laid = await groupsOf(page);
  assert(laid.heads.join("|") === "Full courses|First lessons", `the headings: ${laid.heads.join(", ")}`);
  assert([...laid.full].sort().join() === [...facts.full].sort().join(), `under Full courses: ${laid.full.join(", ")}; by the catalog (${facts.need} lessons or more): ${facts.full.join(", ")}`);
  assert(laid.full[0] === "nl" || !facts.full.includes("nl"), `Dutch isn't first: ${laid.full.join(", ")}`);
  for (const code of laid.full) assert(laid.subs[code] === `${facts.lessons[code]} lessons`, `${code}'s line: "${laid.subs[code]}", its lessons: ${facts.lessons[code]}`);
  assert(!laid.rest.some((code) => laid.subs[code]), `a line under a language with a starter: ${laid.rest.filter((code) => laid.subs[code]).join(", ")}`);
  const names = await page.locator(`${welcome} li:not([hidden]) [data-language]`).evaluateAll((nodes, n) => nodes.slice(n).map((node) => node.querySelector(".lx-row-title").textContent), laid.full.length);
  assert(names.join("|") === [...names].sort((a, b) => a.localeCompare(b, "en")).join("|"), `the rest isn't in order of name: ${names.slice(0, 6).join(", ")}…`);
  assert(!/most so far/i.test(await page.locator(welcome).innerText()), "Dutch is still said to have the most");
  await page.screenshot({ path: join(OUT, "shots", "00b-full-courses-first.png") });
  // A ninth course joins them: Korean's starter planted with as many lessons as a full course, in the catalog this account gets.
  const planted = await newAccount("Ninth Course", {
    before: (context) =>
      context.route(/\/library\/catalogue\.json(\?|$)/, async (route) => {
        const response = await route.fetch();
        const catalog = await response.json();
        if (catalog.packs?.ko?.[0]) catalog.packs.ko[0] = { ...catalog.packs.ko[0], lessons: facts.need };
        return route.fulfill({ response, json: catalog });
      }),
  });
  await onLearn(planted.page);
  await planted.page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} .lx-language-head ~ li [data-language]`)].length > 0 && document.querySelector(`${sel} [data-language="ko"] .lx-row-sub:not([hidden])`), welcome, { timeout: 10_000 }).catch(() => {});
  const withNinth = await groupsOf(planted.page);
  await planted.context.close();
  assert(withNinth.full.includes("ko") && withNinth.subs.ko === `${facts.need} lessons` && withNinth.full.length === laid.full.length + 1, `PLANT: Korean with ${facts.need} lessons: under Full courses ${withNinth.full.join(", ")}, its line "${withNinth.subs.ko}"`);
  return `${laid.full.join(", ")} (${facts.need} lessons each), then ${laid.rest.length} by name; Korean planted with ${facts.need} joins them`;
});
await stage("only languages with something to learn are offered, once the catalog says which", async () => {
  const catalogue = await page.evaluate(async () => (await (await fetch("/library/catalogue.json")).json()).packs ?? {});
  const codes = Object.keys(catalogue);
  if (!codes.length) return "no library on this server: all offered";
  await page.waitForFunction((n) => document.querySelectorAll('.lx-welcome li:not([hidden]) [data-language]').length <= n + 1, codes.length, { timeout: 10_000 });
  const shown = await page.locator(`${welcome} [data-language]:visible`).evaluateAll((nodes) => nodes.map((n) => n.dataset.language));
  const stray = shown.filter((code) => !codes.includes(code) && code !== "nl");
  assert(!stray.length, `offered with nothing to learn: ${stray.join(", ")}`);
  return `${shown.length} of 75`;
});
await stage("the control: with the catalog held back, every language shows and the wait for the catalog's list holds; it goes once the catalog answers", async () => {
  const offered = await offeredOf();
  if (!offered) return "no library on this server: nothing's taken away, so nothing to wait for";
  let answer;
  const answered = new Promise((resolve) => (answer = resolve));
  const held = await newAccount("Catalog Held", {
    before: (context) =>
      context.route("**/library/catalogue.json", async (route) => {
        await answered;
        await route.continue();
      }),
  });
  try {
    await onLearn(held.page);
    const all = await shownRows(held.page);
    if (all.every((code) => offered.includes(code))) return "every language is offered: nothing to wait for";
    const scrolls = await held.page.locator(`${welcome} .lx-welcome-list`).evaluate((n) => n.scrollHeight > n.clientHeight);
    assert(scrolls, `all ${all.length} languages up and the list doesn't scroll`);
    let went = false;
    try {
      await settledList(held.page, 3000);
      went = true;
    } catch {}
    assert(!went, "the wait went while the catalog was held back, so it waits for nothing");
    assert((await shownRows(held.page)).length === all.length, "the list changed with the catalog held back");
    answer();
    const shown = await settledList(held.page, 10_000);
    return `held: all ${all.length} shown (the list scrolls), the wait held 3 s; answered: ${shown.length} shown (${shown.slice(0, 6).join(", ")})`;
  } finally {
    answer();
    await held.context.close();
  }
});
await stage("every row has its name, and none is English", async () => {
  const rows = await page.locator(`${welcome} [data-language]`).evaluateAll((nodes) => nodes.map((n) => [n.dataset.language, n.textContent.trim()]));
  assert(!rows.some(([code]) => code === "en"), "English is offered");
  assert(rows.every(([, name]) => name.length > 1), "a row has no name");
  assert(rows[0][0] === "nl", `the first row is ${rows[0][0]}`);
});
await stage("the search narrows the list, and says when there's nothing", async () => {
  const find = page.locator(`${welcome} input[type="search"]`);
  const size = await find.evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  assert(size >= 16, `the field is ${size}px: an iPhone zooms in`);
  // In what the list shows once the catalog has answered: Spanish where it has packs, else the first language shown, by the start of its name.
  const listed = await settledList(page);
  const labels = await page.locator(`${welcome} li:not([hidden]) [data-language]`).evaluateAll((nodes) => nodes.map((n) => [n.dataset.language, n.querySelector(".lx-row-title")?.textContent ?? ""]));
  const [code, label] = labels.find(([c]) => c === "es") ?? labels[0];
  const q = code === "es" ? "span" : label.slice(0, 4).toLowerCase();
  // What the welcome matches: a language's name as shown, or its English name.
  const expected = await page.evaluate(
    async ({ listed, q }) => {
      const { LANGUAGES } = await import("/js/lang/index.js");
      const { languageLabel } = await import("/js/lx/i18n.js");
      return listed.filter((c) => languageLabel(c).toLowerCase().includes(q) || LANGUAGES[c].name.toLowerCase().includes(q));
    },
    { listed, q },
  );
  await find.fill(q);
  const shown = await shownRows(page);
  assert(shown.includes(code) && shown.sort().join() === expected.sort().join(), `searching "${q}": ${shown.join(", ")} (expected ${expected.join(", ")})`);
  await find.fill("nothing like this");
  await page.getByText("No language by that name yet.").waitFor();
  await page.screenshot({ path: join(OUT, "shots", "02-nothing.png") });
  await find.fill("");
  const back = await shownRows(page);
  assert(back.length === listed.length, `${back.length} of the ${listed.length} shown before the search are back`);
  return `"${q}": ${shown.join(", ")} of ${listed.length}`;
});
await stage("a press 3 ms in, while Tinta waves: it's gone in that frame, and that's the language", async () => {
  await page.reload();
  await page.waitForSelector(welcome);
  await page.waitForTimeout(3);
  const at = await page.evaluate(async () => {
    const row = document.querySelector('.lx-welcome [data-language="es"]');
    row.click();
    return { gone: !document.querySelector(".lx-welcome"), lock: document.documentElement.hasAttribute("data-scroll-lock") };
  });
  assert(at.gone && !at.lock, `after the press: ${JSON.stringify(at)}`);
  const lang = await page.evaluate(async () => (await import("/js/study/learning.js")).learning());
  assert(lang === "es", `learning ${lang}`);
  await page.waitForSelector('[data-part="header-language"]');
  await page.waitForFunction(() => document.querySelector('[data-part="header-language"]')?.textContent.includes("ES"), null, { timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, "shots", "03-home-in-spanish.png") });
  await page.locator('[data-part="next-step"]').waitFor({ timeout: 30_000 });
  // Its first lesson comes up by itself once its pack is here (a server with the open library), and never says there's nothing to study.
  const catalogue = await page.evaluate(async () => (await (await fetch("/library/catalogue.json")).json()).packs ?? {});
  const said = () => page.locator('[data-part="next-step"]').innerText();
  assert(!/nothing new to study/.test(await said()) || catalogue.es?.length, await said());
  if (catalogue.es?.length) {
    await page.getByText("Your first lesson").waitFor({ timeout: 30_000 });
    await page.screenshot({ path: join(OUT, "shots", "04-first-lesson-in-spanish.png") });
  }
  return catalogue.es?.length ? "its first lesson, once its pack came" : "no library on this server";
});
await stage("nothing's fetched for a language nobody picked: a first run asks before any pack comes", async () => {
  const fresh = await newAccount("Asks First");
  await fresh.page.waitForSelector(welcome);
  await fresh.page.waitForTimeout(1500);
  const packsNow = () => fresh.page.evaluate(async () => (await import("/js/study/packs.js")).libraryPacks().map((p) => p.id));
  const before = await packsNow();
  assert(!before.some((id) => id !== "starter-word-order"), `packs taken before a language was picked: ${before.join(", ")}`);
  await onLearn(fresh.page);
  const picked = await pickToLearn(fresh.page, ["de"]);
  await fresh.page.waitForSelector(welcome, { state: "detached" });
  const catalogue = await fresh.page.evaluate(async () => (await (await fetch("/library/catalogue.json")).json()).packs ?? {});
  if (catalogue[picked]?.length) assert(await packCame(fresh.page, picked, 30_000), `${picked} was picked, and its pack never came`);
  await fresh.context.close();
  return `${picked} picked, its pack came after`;
});
await stage("the control: with a language's pack held back, that wait fails, and Home says it's getting it ready, never that there's nothing to study", async () => {
  const held = await newAccount("Pack Held Back");
  const catalogue = await held.page.evaluate(async () => (await (await fetch("/library/catalogue.json")).json()).packs ?? {});
  if (!catalogue.fr?.length) {
    await held.context.close();
    return "no library on this server";
  }
  // Every pack the catalog lists for French, by its id (its lessons' pack and its word packs, whatever they're called).
  const frenchIds = catalogue.fr.map((pack) => pack.id).filter(Boolean);
  await held.page.route("**/library/packs/**", (route) => (frenchIds.some((id) => route.request().url().includes(`/${id}/`) || route.request().url().includes(`/${id}.`)) ? route.abort() : route.continue()));
  await onLearn(held.page);
  const picked = await pickToLearn(held.page, ["fr"]);
  if (picked !== "fr") {
    await held.context.close();
    return "French isn't offered on this server";
  }
  assert(!(await packCame(held.page, "fr", 4_000)), "a pack came that was held back, so this wait proves nothing");
  const said = await held.page.locator('[data-part="next-step"]').innerText();
  assert(/Getting French ready/.test(said) && !/nothing new to study/.test(said), `Home: ${said}`);
  await held.context.close();
  return "the wait failed as it should";
});
await stage("never asked again: a reload, and a language kept", async () => {
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.waitForTimeout(600);
  assert(!(await page.locator(welcome).count()), "asked again after a reload");
  const lang = await page.evaluate(async () => (await import("/js/study/learning.js")).learning());
  assert(lang === "es", `learning ${lang} after a reload`);
});
await stage("#welcome opens it again, to look at, and a press there still works", async () => {
  await page.goto(`${BASE}/app/#welcome`);
  await page.reload();
  await page.waitForSelector(welcome);
  const picked = await pickToLearn(page, ["fr"]);
  await page.waitForSelector(welcome, { state: "detached" });
  const lang = await page.evaluate(async () => (await import("/js/study/learning.js")).learning());
  assert(lang === picked, `${picked} pressed, learning ${lang}`);
  return `${picked} pressed and kept`;
});
await context.close();

await stage("a phone set to another language than English (Spanish), or to one nobody knows: the same one question and the same list, Spanish offered", async () => {
  const notes = [];
  for (const languages of [["es-ES"], ["xx-YY"]]) {
    const other = await newAccount(`Phone ${languages[0]}`, { languages });
    await onLearn(other.page);
    const rows = await rowsOf(other.page);
    assert(rows.some(([code]) => code === "es") && !rows.some(([code]) => code === "en"), `on a phone set to ${languages[0]}, offered: ${rows.slice(0, 6).map((r) => r[0]).join(", ")}…`);
    assert(!rows.some(([, , sub]) => /phone/i.test(sub ?? "")), "a row marked as the phone's language");
    assert((await other.page.evaluate(() => localStorage.getItem("lx.interface.v1"))) === null, "something kept about the language spoken");
    if (languages[0] === "es-ES") await other.page.screenshot({ path: join(OUT, "shots", "05-phone-in-spanish.png") });
    await other.context.close();
    notes.push(`${languages[0]}: ${rows.length} languages`);
  }
  return notes.join("; ");
});

await stage("a device that said which language it speaks, when that was asked, keeps its answer: not offered that one, and it's kept as it was", async () => {
  const stored = JSON.stringify({ speak: "nl", app: null, grow: false });
  const said = await newAccount("Said Dutch", { stored: { "lx.interface.v1": stored } });
  await onLearn(said.page);
  assert(!(await said.page.locator(`${welcome} .lx-welcome-said`).count()), "a line about the language spoken");
  assert(!(await said.page.locator(`${welcome} [data-language="nl"]`).count()), "Dutch is offered to someone who said they speak it");
  assert((await said.page.evaluate(() => localStorage.getItem("lx.interface.v1"))) === stored, "what it said was changed");
  await said.context.close();
});

await stage("a device where a language was already picked isn't asked", async () => {
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", colorScheme: "dark" });
  await second.addInitScript(() => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "de", from: "en" })));
  const p = await second.newPage();
  const cdp = await second.newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/app/`);
  await p.waitForURL(/\/login\?next=/);
  await p.click("summary");
  await p.fill('input[name="name"]', "Has A Language");
  await p.click('#register button[type="submit"]');
  await p.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await p.waitForSelector("html[data-app-ready]");
  await p.waitForTimeout(500);
  assert(!(await p.locator(welcome).count()), "a device with a language was asked");
  await second.close();
});

await stage("an account that has already studied isn't asked (the control: the same page with nothing studied is)", async () => {
  const fresh = await newAccount("Has Studied");
  await fresh.page.waitForSelector(welcome);
  await fresh.page.evaluate(async () => {
    const { finishedPractice } = await import("/js/study/done.js");
    finishedPractice(Date.now() - 86_400_000);
  });
  await fresh.page.reload();
  await fresh.page.waitForSelector("html[data-app-ready]");
  await fresh.page.waitForTimeout(500);
  assert(!(await fresh.page.locator(welcome).count()), "someone who has studied was asked");
  await fresh.context.close();
});

// The language you learn from (study/learning.js fromFor; interface-language.js speaks), as a learner picks what to learn. Nobody's asked
// which language they speak, so a new learner learns every language from English, whatever their phone is set to. A device that said it
// speaks Spanish, when that was asked, still learns English from Spanish and every other language from English, never from the language it
// learned before (a new learner who spoke Spanish and picked English was once set to learn it from Dutch).
await stage("the language you learn from: from English for a new learner on a Spanish phone; a device that said Spanish keeps English from Spanish, never the language before", async () => {
  const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("lx.learning.v1") ?? "null"));
  const said = (value) => `${value?.lang} from ${value?.from}`;
  // A row pressed as a person would, in the first run or Settings → Language's sheet (shown or not: a server without the
  // open library offers every language, one with it only those with packs, and this is about what a press keeps).
  const press = async (page, list, code) => {
    const row = `${list} [data-language="${code}"]`;
    await page.waitForSelector(row, { state: "attached", timeout: 10_000 });
    await page.evaluate((row) => document.querySelector(row).click(), row);
    await page.waitForTimeout(300);
  };
  const sheet = async (page, code) => {
    await page.evaluate(async () => (await import("/js/shell/welcome.js")).openLanguageSheet());
    await press(page, '.lx-sheet-layer:not([hidden]) [data-part="sheet"]', code);
  };
  const fresh = await newAccount("Spanish Phone", { languages: ["es-ES"] });
  const old = await newAccount("Said Spanish", { languages: ["es-ES"], stored: { "lx.interface.v1": JSON.stringify({ speak: "es", app: null, grow: false }) } });
  try {
    await onLearn(fresh.page);
    // (German: picking Dutch, the language a device starts on, changes nothing, so nothing is kept to read.)
    await press(fresh.page, welcome, "de");
    const dutchNew = await kept(fresh.page);
    assert(dutchNew?.lang === "de" && dutchNew?.from === "en", `a new learner on a Spanish phone picks German: kept as ${said(dutchNew)}`);
    const english = await fresh.page.evaluate(async () => {
      (await import("/js/shell/welcome.js")).openLanguageSheet();
      await new Promise((done) => setTimeout(done, 500));
      return Boolean(document.querySelector('.lx-sheet-layer:not([hidden]) [data-language="en"]'));
    });
    assert(!english, "English is offered to learn to someone nobody asked which language they speak");
    await onLearn(old.page);
    await press(old.page, welcome, "en");
    const first = await kept(old.page);
    assert(first?.lang === "en" && first?.from === "es", `a device that said Spanish picks English: kept as ${said(first)}`);
    await sheet(old.page, "nl");
    const dutch = await kept(old.page);
    assert(dutch?.lang === "nl" && dutch?.from === "en", `then Dutch is kept as ${said(dutch)}`);
    await sheet(old.page, "en");
    const back = await kept(old.page);
    assert(back?.lang === "en" && back?.from === "es", `back to English, it's kept as ${said(back)}`);
    return `new: ${said(dutchNew)}; said Spanish: ${said(first)}, then ${said(dutch)}, then ${said(back)}`;
  } finally {
    await fresh.context.close();
    await old.context.close();
  }
});

await stage("checks start on Home: without LX_FIRST_RUN, no first run", async () => {
  const { spawnSync } = await import("node:child_process");
  const out = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { chromium } = await import(${JSON.stringify(new URL("./quiet-browser.mjs", import.meta.url).href)});
    const b = await chromium.launch({ headless: true });
    const c = await b.newContext();
    const p = await c.newPage();
    await p.route("**/app/stand-in", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }));
    await p.goto(${JSON.stringify(`${BASE}/app/stand-in`)});
    console.log(await p.evaluate(() => localStorage.getItem("lx.welcome.v1")));
    await b.close();
  `], { encoding: "utf8", env: { ...process.env, LX_FIRST_RUN: "" } });
  assert(out.stdout.trim() === "check", `the mark a check starts with: ${out.stdout.trim()} ${out.stderr.slice(0, 200)}`);
});

await browser.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);

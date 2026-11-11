// A first run, on a phone in Chrome: a brand-new account is asked which language it speaks, its phone's own first and none assumed, then what it wants to learn, before anything
// else; it's gone at the second press. A phone whose languages it doesn't know, the plain list; a device that has said, only what to learn; Change going back. The list and its search;
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
const SPEAK = "Which language do you speak?";
const LEARN = "What do you want to learn?";
const titleOf = (page) => page.locator(`${welcome} [data-part="page-title"]`).textContent();
// The first question answered: the language this account speaks (English unless given), and the second question up.
async function answerSpeak(page, code = "en") {
  await page.waitForSelector(welcome);
  const title = await titleOf(page);
  assert(title === SPEAK, `the first question is "${title}"`);
  await page.locator(`${welcome} [data-language="${code}"]`).click();
  await page.waitForFunction((learn) => document.querySelector('.lx-welcome [data-part="page-title"]')?.textContent === learn, LEARN, { timeout: 5_000 });
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
await stage("a brand-new account is asked first which language it speaks, its phone's own first, none assumed", async () => {
  await page.waitForSelector(welcome);
  assert((await titleOf(page)) === SPEAK, `its title: ${await titleOf(page)}`);
  const rows = await rowsOf(page);
  assert(rows[0][0] === "en" && rows[1][0] === "nl", `the first rows are ${rows.slice(0, 2).map((r) => r[0]).join(", ")}, not the phone's English and Dutch`);
  const phone = rows.filter(([, , sub]) => sub === "This phone's language").map(([code]) => code);
  assert(phone.join() === "en,nl", `marked as the phone's: ${phone.join(", ")}`);
  assert(!rows.some(([, , , current]) => current === "true"), "a language is marked as chosen before anything was said");
  assert(rows.length >= 70, `only ${rows.length} languages: anyone may speak any of them`);
  const kept = await page.evaluate(() => localStorage.getItem("lx.interface.v1"));
  assert(kept === null, `something was kept before an answer: ${kept}`);
  await page.screenshot({ path: join(OUT, "shots", "00-i-speak.png") });
  return `${rows.length} languages, the phone's English and Dutch first`;
});
await stage("then what it wants to learn, under what it said it speaks", async () => {
  await answerSpeak(page, "en");
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.interface.v1"))?.speak);
  assert(kept === "en", `kept as spoken: ${kept}`);
  const said = await page.locator(`${welcome} .lx-welcome-said`).innerText();
  assert(/^You speak English\.\s+Change$/.test(said.trim()), `the line: ${said}`);
});
await stage("Change goes back to which language it speaks, and an answer there comes back here", async () => {
  await page.locator(`${welcome} .lx-welcome-change`).click();
  assert((await titleOf(page)) === SPEAK, `Change opened "${await titleOf(page)}"`);
  const current = (await rowsOf(page)).filter(([, , , c]) => c === "true").map(([code]) => code);
  assert(current.join() === "en", `marked as chosen: ${current.join(", ")}`);
  await answerSpeak(page, "en");
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
    await answerSpeak(held.page);
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
  // The language you speak is no language to learn: answering it takes no pack either.
  await answerSpeak(fresh.page, "pl");
  await fresh.page.waitForTimeout(1500);
  const spoken = await packsNow();
  assert(!spoken.some((id) => id !== "starter-word-order"), `packs taken for the language spoken: ${spoken.join(", ")}`);
  assert(!(await fresh.page.locator(`${welcome} [data-language="pl"]`).count()), "the language spoken is offered to learn");
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
  await held.page.route("**/library/packs/starter-fr/**", (route) => route.abort());
  await answerSpeak(held.page);
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

await stage("a phone whose languages it doesn't know: the plain list, nothing first, nothing assumed", async () => {
  const odd = await newAccount("Odd Phone", { languages: ["xx-YY"] });
  await odd.page.waitForSelector(welcome);
  assert((await titleOf(odd.page)) === SPEAK, `its title: ${await titleOf(odd.page)}`);
  const rows = await rowsOf(odd.page);
  assert(!rows.some(([, , sub]) => sub), `a line under a row: ${rows.filter(([, , sub]) => sub).map(([c]) => c).join(", ")}`);
  assert(!rows.some(([, , , current]) => current === "true"), "a language is marked as chosen");
  const names = rows.map(([, name]) => name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "en"));
  assert(names.join("|") === sorted.join("|"), `not in order of name: ${names.slice(0, 5).join(", ")}…`);
  await odd.page.screenshot({ path: join(OUT, "shots", "05-phone-says-nothing.png") });
  await odd.context.close();
  return `${rows.length} languages in order of name`;
});

await stage("a device that has said which language it speaks is asked only what to learn, and not offered that one", async () => {
  const said = await newAccount("Said Dutch", { stored: { "lx.interface.v1": JSON.stringify({ speak: "nl", app: null, grow: false }) } });
  await said.page.waitForSelector(welcome);
  assert((await titleOf(said.page)) === LEARN, `its title: ${await titleOf(said.page)}`);
  const line = await said.page.locator(`${welcome} .lx-welcome-said`).innerText();
  assert(/^You speak Dutch\./.test(line.trim()), `the line: ${line}`);
  assert(!(await said.page.locator(`${welcome} [data-language="nl"]`).count()), "Dutch is offered to someone who speaks it");
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

// The language you learn from (study/learning.js fromFor), as a learner picks what to learn: English from the language they
// speak (English's packs are written from it), every other language from English (theirs are), never the language they
// learned before. A new learner who spoke Spanish and picked English was set to learn it from Dutch, the first language's,
// and read "Tap an English word, then its Dutch." over Spanish words.
await stage("the language you learn from: English from the one you speak, every other language from English, never the one before", async () => {
  const es = await newAccount("Speaks Spanish", { languages: ["es-ES"] });
  try {
    const kept = () => es.page.evaluate(() => JSON.parse(localStorage.getItem("lx.learning.v1") ?? "null"));
    const said = (value) => `${value?.lang} from ${value?.from}`;
    // A row pressed as a person would, in the first run or Settings → Language's sheet (shown or not: a server without the
    // open library offers every language, one with it only those with packs, and this is about what a press keeps).
    const press = async (list, code) => {
      const row = `${list} [data-language="${code}"]`;
      await es.page.waitForSelector(row, { state: "attached", timeout: 10_000 });
      await es.page.evaluate((row) => document.querySelector(row).click(), row);
      await es.page.waitForTimeout(300);
    };
    const sheet = async (code) => {
      await es.page.evaluate(async () => (await import("/js/shell/welcome.js")).openLanguageSheet());
      await press('.lx-sheet-layer:not([hidden]) [data-part="sheet"]', code);
    };
    await answerSpeak(es.page, "es");
    await press(welcome, "en");
    const english = await kept();
    assert(english?.lang === "en" && english?.from === "es", `a Spanish speaker's first pick, English, is kept as ${said(english)}`);
    await sheet("nl");
    const dutch = await kept();
    assert(dutch?.lang === "nl" && dutch?.from === "en", `then Dutch is kept as ${said(dutch)}`);
    await sheet("en");
    const back = await kept();
    assert(back?.lang === "en" && back?.from === "es", `back to English, it's kept as ${said(back)}`);
    return `${said(english)}, then ${said(dutch)}, then ${said(back)}`;
  } finally {
    await es.context.close();
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

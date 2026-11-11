// lx-app (scratch, recorded with the 48 own-weave languages, 11 Nov 2026): the director's look. On a local copy, phones at 390:
//   a Polish learner: the AI section's "Weave a text" row, and the reader's offer on an English text of theirs (Weave it with your AI);
//   a Hindi learner and a Georgian learner: an English text their AI added and wove (add_text, add_weave over MCP with a personal token,
//   nothing pressed), its nouns known, open in the reader: their script inside the English sentence.
// node look-stills.mjs <app dir> http://localhost:<port> <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [APP, BASE, outArg] = process.argv.slice(2);
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(pathToFileURL(join(resolve(APP), "scripts/quiet-browser.mjs")).href);
const said = [];
const say = (what) => {
  said.push(what);
  console.log(`  ${what}`);
};
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

const TEXT = "My dog drinks water. My brother reads books.";
// The weaves, in the guide's form, written by hand as an AI would (t in English order; m the language's own order with its cues).
const WEAVES = {
  hi: {
    known: ["कुत्ता", "पानी", "भाई", "किताब"],
    sentences: [
      {
        x: 0,
        t: [{ w: "My", target: "मेरा", lemma: "मेरा" }, { w: "dog", target: "कुत्ता", lemma: "कुत्ता" }, { w: "drinks", target: "पीता है", lemma: "पीना" }, { w: "water.", target: "पानी.", lemma: "पानी" }],
        text: "मेरा कुत्ता पानी पीता है।",
        m: [{ target: "मेरा", cue: "my", sources: [0], lemma: "मेरा" }, { target: "कुत्ता", cue: "dog", sources: [1], lemma: "कुत्ता" }, { target: "पानी", cue: "water", sources: [3], lemma: "पानी" }, { target: "पीता", cue: "drinks", sources: [2], lemma: "पीना" }, { target: "है।", cue: "is", sources: [2], lemma: "होना" }],
      },
      {
        x: 1,
        t: [{ w: "My", target: "मेरा", lemma: "मेरा" }, { w: "brother", target: "भाई", lemma: "भाई" }, { w: "reads", target: "पढ़ता है", lemma: "पढ़ना" }, { w: "books.", target: "किताबें.", lemma: "किताब" }],
        text: "मेरा भाई किताबें पढ़ता है।",
        m: [{ target: "मेरा", cue: "my", sources: [0], lemma: "मेरा" }, { target: "भाई", cue: "brother", sources: [1], lemma: "भाई" }, { target: "किताबें", cue: "books", sources: [3], lemma: "किताब" }, { target: "पढ़ता", cue: "reads", sources: [2], lemma: "पढ़ना" }, { target: "है।", cue: "is", sources: [2], lemma: "होना" }],
      },
    ],
  },
  ka: {
    known: ["ძაღლი", "წყალი", "ძმა", "წიგნი"],
    sentences: [
      {
        x: 0,
        t: [{ w: "My", target: "ჩემი", lemma: "ჩემი" }, { w: "dog", target: "ძაღლი", lemma: "ძაღლი" }, { w: "drinks", target: "სვამს", lemma: "სმა" }, { w: "water.", target: "წყალს.", lemma: "წყალი" }],
        text: "ჩემი ძაღლი წყალს სვამს.",
        m: [{ target: "ჩემი", cue: "my", sources: [0], lemma: "ჩემი" }, { target: "ძაღლი", cue: "dog", sources: [1], lemma: "ძაღლი" }, { target: "წყალს", cue: "water", sources: [3], lemma: "წყალი" }, { target: "სვამს.", cue: "drinks", sources: [2], lemma: "სმა" }],
      },
      {
        x: 1,
        t: [{ w: "My", target: "ჩემი", lemma: "ჩემი" }, { w: "brother", target: "ძმა", lemma: "ძმა" }, { w: "reads", target: "კითხულობს", lemma: "კითხვა" }, { w: "books.", target: "წიგნებს.", lemma: "წიგნი" }],
        text: "ჩემი ძმა წიგნებს კითხულობს.",
        m: [{ target: "ჩემი", cue: "my", sources: [0], lemma: "ჩემი" }, { target: "ძმა", cue: "brother", sources: [1], lemma: "ძმა" }, { target: "წიგნებს", cue: "books", sources: [3], lemma: "წიგნი" }, { target: "კითხულობს.", cue: "reads", sources: [2], lemma: "კითხვა" }],
      },
    ],
  },
};

const browser = await chromium.launch();
const errors = [];

/** A phone signed up, learning `lang`, with a personal token, and MCP calls as an AI makes them. */
async function phone(name, lang) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', `Look ${name}`);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.evaluate(async (l) => (await import("/js/study/learning.js")).setLearning(l), lang);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  const learning = await page.evaluate(async () => (await import("/js/study/learning.js")).learning());
  assert(learning === lang, `${name}: learning ${learning}, not ${lang}`);
  const token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Your AI" }) })).json()).token);
  assert(token, `${name}: no token`);
  const tool = async (tname, args = {}) => {
    const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tname, arguments: args } }) });
    const text = await response.text();
    const line = text.split("\n").find((l) => l.startsWith("data: "));
    if (!line) throw new Error(`${tname}: ${response.status} ${text.slice(0, 200)}`);
    const { result, error } = JSON.parse(line.slice(6));
    if (error) throw new Error(`${tname}: ${error.message}`);
    if (result.isError) throw new Error(`${tname}: ${result.content[0].text.slice(0, 600)}`);
    return JSON.parse(result.content[0].text);
  };
  const addText = async (title) => {
    const ticket = await tool("request_text_upload", { format: "text", filename: "text.txt" });
    const put = await fetch(new URL(ticket.upload_url, BASE), { method: ticket.method, headers: { "Content-Type": ticket.content_type }, body: TEXT });
    assert(put.ok, `${name}: the PUT ${put.status}`);
    return tool("add_text", { upload_id: ticket.upload_id, language: "en", title });
  };
  // Waits for a text (and its weave in lang, when asked) to reach the phone through the relay.
  const arrived = async (id, woven) => {
    for (const start = Date.now(); Date.now() - start < 60_000; await page.waitForTimeout(2000)) {
      await page.reload();
      await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
      const found = await page.evaluate(
        async ({ id, lang }) => {
          const store = await import("/js/read/store.js");
          const here = (await store.listBooks()).some((b) => b.id === id);
          return { here, woven: ((await store.weaveLanguages()).get(id) ?? []).includes(lang) };
        },
        { id, lang },
      );
      if (found.here && (!woven || found.woven)) return;
    }
    throw new Error(`${name}: the text${woven ? " and its weave" : ""} didn't reach the phone within a minute`);
  };
  const openText = async (title) => {
    await page.evaluate(() => (location.hash = "#read"));
    await page.waitForTimeout(2500);
    const card = page.locator(`[data-part="book-tile"]:has-text("${title}")`).first();
    await card.waitFor({ timeout: 15_000 });
    await card.click();
    await page.waitForSelector('[data-part="reader"]:not([data-ghost])[data-ready]', { timeout: 30_000 });
    await page.waitForTimeout(1500);
  };
  return { name, context, page, tool, addText, arrived, openText };
}

try {
  // Polish: the AI section's row, and the reader's offer on an English text of theirs.
  const pl = await phone("Polish", "pl");
  await pl.page.evaluate(() => (location.hash = "#ai"));
  const row = pl.page.locator('[data-part="list-row"]', { hasText: "Weave a text" }).first();
  await row.waitFor({ timeout: 20_000 });
  await row.scrollIntoViewIfNeeded();
  await pl.page.waitForTimeout(800);
  const rowText = (await row.textContent()).replace(/\s+/g, " ").trim();
  assert(/Polish/.test(rowText), `the row doesn't name Polish: ${rowText}`);
  await pl.page.screenshot({ path: join(OUT, "pl-ai-weave-row-390.png") });
  say(`Polish: the AI section's row: ${rowText}`);
  const plText = await pl.addText("My dog and my brother");
  await pl.arrived(plText.text_id, false);
  await pl.openText("My dog and my brother");
  const offer = pl.page.locator('[data-part="reader"]:not([data-ghost]) [data-part="reader-offer"]').first();
  await offer.waitFor({ timeout: 20_000 });
  const offerText = (await offer.textContent()).replace(/\s+/g, " ").trim();
  assert(/Weave it with your AI/.test(offerText), `the reader's offer: ${offerText}`);
  await pl.page.screenshot({ path: join(OUT, "pl-reader-offer-390.png") });
  say(`Polish: the reader's offer on an English text of theirs: ${offerText}`);
  await pl.page.evaluate(() => fetch("/account/delete", { method: "POST" })).catch(() => {});
  await pl.context.close();

  // Hindi and Georgian: woven by their AI, their nouns known, open in the reader.
  for (const lang of ["hi", "ka"]) {
    const name = lang === "hi" ? "Hindi" : "Georgian";
    const p = await phone(name, lang);
    const guide = await p.tool("get_weave_guide", { language: lang });
    assert(guide.guide.includes(`Woven into ${name}`), `${name}'s guide doesn't name it`);
    const added = await p.addText(`My dog and my brother (${name})`);
    const got = await p.tool("get_text", { text_id: added.text_id });
    assert(got.to_weave?.length === 2, `${name}: to_weave ${JSON.stringify(got).slice(0, 200)}`);
    const woven = await p.tool("add_weave", { text_id: added.text_id, language: lang, weave: { sentences: WEAVES[lang].sentences } });
    say(`${name}: add_weave took it: ${woven.change_id}`);
    await p.arrived(added.text_id, true);
    await p.page.evaluate(
      async ({ lang, known }) => {
        const bank = await import("/js/read/bank.js");
        for (const lemma of known) bank.addWord(lang, lemma, { quiet: true });
      },
      { lang, known: WEAVES[lang].known },
    );
    await p.openText(`My dog and my brother (${name})`);
    const shown = await p.page.evaluate(() => {
      const reader = document.querySelector('[data-part="reader"]:not([data-ghost])');
      return { words: [...reader.querySelectorAll('[data-part="woven-word"]')].map((w) => w.textContent.trim()), text: reader.textContent.replace(/\s+/g, " ").slice(0, 160) };
    });
    assert(shown.words.length >= 2, `${name}: no woven words shown: ${shown.text}`);
    await p.page.screenshot({ path: join(OUT, `${lang}-reader-woven-390.png`) });
    say(`${name}: the reader, ${shown.words.length} woven words shown (${shown.words.join(", ")}): ${shown.text}`);
    await p.page.evaluate(() => fetch("/account/delete", { method: "POST" })).catch(() => {});
    await p.context.close();
  }
  assert(!errors.length, `page errors: ${errors.join(" | ")}`);
  writeFileSync(join(OUT, "look-stills.json"), JSON.stringify({ ok: true, said }, null, 1));
  console.log("look stills: done");
} catch (error) {
  writeFileSync(join(OUT, "look-stills.json"), JSON.stringify({ ok: false, error: String(error.stack ?? error), said, errors }, null, 1));
  console.log(`look stills: FAILED\n  ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}

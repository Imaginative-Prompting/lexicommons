// Going to an address in the app, and on only once the app is there. A tab's own page reached from another tab starts that
// tab's history afresh (shell/main.js): the router steps back through the history, and an address set before that settles
// can be taken back (v95: a game opened straight after Home showed Home, and so did Study straight after it). So a check that
// goes somewhere straight after a tab's own page goes there with this. It waits until the address is this one, the router's
// record has it (its hashchange has run) and nothing is stepping back (globalThis.__lxNav, what the checks read), and fails
// if that never comes. Already there, it doesn't navigate: a navigation to the very address the page is at adds a history entry
// with no state and no hashchange, which the router never hears of, and its count of the history is off by one from then on (a
// later step back for a tab's own page landed one entry short, on a session, in tinta-whole-check).
//
// And it goes only once the app has caught up with where it is: a press that changed the address (a session's Done sets #study) gets
// its entry from the router's hashchange a moment later, and a page.goto in between put its own entry first: the router recorded the
// new address twice and never gave the press's entry its place, and a later step back landed on it (v97: push-check's Settings never
// came, the address back on Study). A person can't press between the two; a check must wait for it.
export async function settled(page, { timeout = 3_000 } = {}) {
  await page
    .waitForFunction(
      () => {
        const nav = globalThis.__lxNav?.();
        if (!nav || !document.documentElement.hasAttribute("data-app-ready")) return true;
        const route = `#${location.hash.replace(/^#\/?/, "").split("?")[0] || "today"}`;
        return !nav.afresh && nav.routes[nav.i] === route && history.state?.lx?.i === nav.i;
      },
      null,
      { timeout },
    )
    // Still moving after that: go on, and the wait after the navigation says where the app ended up if it's wrong.
    .catch(() => {});
}

export async function goRouted(page, base, hash, { timeout = 10_000 } = {}) {
  await settled(page);
  const here = await page.evaluate((hash) => location.pathname === "/app/" && location.hash === hash, hash).catch(() => false);
  if (!here) await page.goto(`${base}/app/${hash}`);
  await page
    .waitForFunction(
      (hash) => {
        const nav = globalThis.__lxNav?.();
        const route = `#${hash.replace(/^#\/?/, "").split("?")[0] || "today"}`;
        return document.documentElement.hasAttribute("data-app-ready") && location.hash === hash && Boolean(nav) && !nav.afresh && nav.routes[nav.i] === route;
      },
      hash,
      { timeout },
    )
    .catch(async () => {
      const at = await page.evaluate(() => ({ hash: location.hash, nav: globalThis.__lxNav?.() ?? null })).catch(() => null);
      throw new Error(`the app never settled at ${hash}: ${JSON.stringify(at)}`);
    });
}

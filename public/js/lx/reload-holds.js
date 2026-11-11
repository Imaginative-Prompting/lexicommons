// What a reload would cut short that the page can't see on its own: a download the person started (Whisper's model, Translate's full
// translator, a book from the shelf) goes on after they leave its page. Each holds the app's one reload of its own (shell/new-version.js)
// while it runs. No imports, so the modules that download stay loadable in Node's tests.

const holds = new Set();

/** Holds the reload while something runs; returns the release (safe to call twice). */
export function holdReload(what) {
  const hold = { what };
  holds.add(hold);
  return () => holds.delete(hold);
}

/** What holds the reload now (empty: nothing). */
export const reloadHolds = () => [...holds].map((hold) => hold.what);

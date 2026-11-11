// Where a check taps a link or a button as a person does: on its words, never on its middle as such. Tinta standing on a link (data-pokeable:
// Home's streak spot and Your AI card, Study's path strip, the path's stops, the AI tab) takes a tap on him as a poke, his alone, and the link
// doesn't open (7 Nov 2026): a tap at a link's middle can land on him once your place sits there, and the check then waits for a page that
// never comes. Self-contained (run in the page): `await locator.evaluate(wordsPoint)` or `await handle.evaluate(wordsPoint)`, the node on the
// screen (scrolled into view first).
//
// Returns { x, y } in the viewport: the middle of the first run of the node's own words (a text node with letters, not inside Tinta or a
// drawing) whose point really lands on the node and not on Tinta (elementFromPoint), else for a link that's all picture its middle, where a
// person taps it, else the first such point on a grid over the node's box, else null (nothing of it can be tapped but Tinta). (Its middle
// first: Study's settings gear, notched over the Practice door's corner, was tapped near its corner, and in WebKit that tap opened Practice:
// the WebKit sweep, 7 Nov.)
export function wordsPoint(node) {
  const mine = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit === node || node.contains(hit)) && !hit.closest("[data-pokeable]"));
  };
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode: (text) => (/\p{L}|\p{N}/u.test(text.textContent) && !text.parentElement?.closest("[data-pokeable], svg") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (mine(at.x, at.y)) return at;
    }
  }
  const box = node.getBoundingClientRect();
  const middle = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  if (mine(middle.x, middle.y)) return middle;
  for (let j = 1; j < 8; j++) {
    for (let i = 1; i < 8; i++) {
      const at = { x: box.left + (box.width * i) / 8, y: box.top + (box.height * j) / 8 };
      if (mine(at.x, at.y)) return at;
    }
  }
  return null;
}

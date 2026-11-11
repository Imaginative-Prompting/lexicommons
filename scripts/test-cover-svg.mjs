// A text's cover (public/js/read/cover-svg.js) against the ways an SVG can carry more than a picture: scripts and event
// attributes in every case, links and outside references, foreign content, styles, entities and DOCTYPEs, CDATA,
// processing instructions, namespaces, nested SVG, the limits, and values made to make a pattern slow. Whatever comes
// out is written again from what was kept, so the last test reads every output for anything that could run or reach
// out. Pure, so it runs in Node: `node scripts/test-cover-svg.mjs` (exit 0 = pass).

import { COVER_FILE, COVER_LIMITS, CoverError, cleanCover, coverFile } from "../public/js/read/cover-svg.js";

let failed = 0;
let passed = 0;
const outputs = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const svg = (inner, root = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150"${root}>${inner}</svg>`;
const kept = (input) => {
  const out = cleanCover(input);
  outputs.push(out.svg);
  return out;
};
const refused = (input, pattern) => {
  try {
    const out = cleanCover(input);
    outputs.push(out.svg);
  } catch (error) {
    ok(error instanceof CoverError, `not a CoverError: ${error.message}`);
    ok(pattern.test(error.message), `refused, but with "${error.message}"`);
    return;
  }
  throw new Error(`not refused (wanted ${pattern})`);
};
const quick = (fn, ms = 250) => {
  const started = performance.now();
  fn();
  const took = performance.now() - started;
  ok(took < ms, `took ${Math.round(took)} ms`);
};

await test("a cover as your AI would draw one is kept whole: shapes, a gradient, text with its style", () => {
  const input = svg(
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3557"/><stop offset="100%" stop-color="rgb(69, 123, 157)"/></linearGradient></defs>' +
      '<rect width="100" height="150" fill="url(#sky)"/><circle cx="50" cy="60" r="20" fill="#f1c40f" opacity="0.9"/>' +
      '<path d="M10 120 L50 90 L90 120 Z" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/>' +
      '<g transform="translate(50, 135) scale(1.2)"><text text-anchor="middle" font-family="Georgia, serif" font-size="9" fill="white">De rode jas</text></g>',
  );
  const out = kept(input);
  ok(out.dropped.length === 0, JSON.stringify(out.dropped));
  for (const part of ['<linearGradient id="sky"', 'stop-color="rgb(69, 123, 157)"', 'fill="url(#sky)"', 'transform="translate(50, 135) scale(1.2)"', ">De rode jas</text>"]) ok(out.svg.includes(part), `${part} missing from ${out.svg}`);
});

await test("scripts in any case, with whatever is inside them, are left out", () => {
  for (const tag of ["script", "Script", "SCRIPT", "sCrIpT"]) {
    const out = kept(svg(`<${tag}>alert(1)</${tag}><rect width="1" height="1"/>`));
    ok(!/alert|script/i.test(out.svg), out.svg);
  }
  ok(!/alert/.test(kept(svg('<script type="text/ecmascript"><![CDATA[alert(1)]]></script>'.replace("<![CDATA[alert(1)]]>", "alert(1)"))).svg), "inside");
});

await test("event attributes in any case are left out, on the root too", () => {
  const out = kept(svg('<rect width="1" height="1" onload="alert(1)" onLoad="alert(2)" ONCLICK="alert(3)" onmouseover="x"/>', ' onload="alert(4)"'));
  ok(!/alert|on[a-z]+=/i.test(out.svg), out.svg);
});

await test("links and outside references go: a, href, xlink:href, use, image, an outside url() in a paint", () => {
  const out = kept(
    svg(
      '<a href="javascript:alert(1)"><rect width="1" height="1"/></a><use href="#x"/><use xlink:href="data:image/svg+xml,&lt;svg onload=alert(1)&gt;"/>' +
        '<image href="https://example.com/x.png" width="10" height="10"/><rect width="1" height="1" fill="url(https://example.com/x.svg#a)" stroke="url( #ok )" clip-path="url(javascript:alert(1))"/>' +
        '<linearGradient id="g" href="https://example.com/g.svg#h" xlink:href="#other"/>',
      ' xmlns:xlink="http://www.w3.org/1999/xlink"',
    ),
  );
  const body = out.svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
  ok(!/href|javascript|https?:|data:|<use|<image|<a[ >]/i.test(body), out.svg);
  ok(out.svg.includes('stroke="url( #ok )"'), "a local url() stays");
});

await test("foreign content, styles and animation go, with everything inside them", () => {
  const out = kept(
    svg(
      '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></div></foreignObject>' +
        '<style>@import url(https://example.com/x.css); rect { fill: url(https://example.com/x) }</style>' +
        '<rect width="1" height="1" style="fill: url(https://example.com/x); behavior: url(x.htc)"/>' +
        '<set attributeName="href" to="javascript:alert(1)"/><animate attributeName="onload" values="alert(1)"/><filter id="f"><feImage href="https://example.com/x"/></filter>' +
        '<pattern id="p"><image href="x"/></pattern><mask id="m"/><iframe src="x"/>',
    ),
  );
  ok(!/foreignObject|div|img|style|import|example\.com|set|animate|filter|feImage|pattern|mask|iframe|alert/i.test(out.svg), out.svg);
});

await test("namespaced elements and attributes are left out; the root declares only SVG's namespace", () => {
  const out = kept(svg('<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script><html:script xmlns:html="http://www.w3.org/1999/xhtml">alert(2)</html:script><rect width="1" height="1" xml:base="https://example.com/" ev:event="click"/>', ' xmlns:ev="http://www.w3.org/2001/xml-events" xml:lang="nl"'));
  ok(!/alert|xmlns:|xml:|ev:|example/.test(out.svg), out.svg);
  ok(out.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150">'), out.svg);
  refused('<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 1 1"/>', /xmlns must be/);
});

await test("a DOCTYPE, an entity of its own, CDATA and processing instructions are refused", () => {
  refused('<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>' + svg("<text>&b;</text>"), /DOCTYPE/);
  refused(svg("<text>&nbsp;</text>"), /isn't a character|bare &/);
  refused(svg("<text>&b;</text>"), /isn't a character/);
  refused(svg("<text><![CDATA[<script>alert(1)</script>]]></text>"), /CDATA/);
  refused('<?xml-stylesheet href="https://example.com/x.css"?>' + svg(""), /processing instruction/);
  refused(svg('<?php echo 1 ?><rect width="1" height="1"/>'), /processing instruction/);
  refused(svg("<text>a & b</text>"), /bare &/);
  kept('<?xml version="1.0" encoding="UTF-8"?>' + svg("<!-- a comment --><rect width='1' height='1'/>"));
});

await test("character references are read, then written out escaped: none can make markup", () => {
  const out = kept(svg('<text x="1" y="1">&#60;script&#62;alert(1)&#x3C;/script&#x3E; &lt;b&gt; &amp;</text><rect width="1" height="1" fill="&#106;avascript:alert(1)"/>'));
  ok(out.svg.includes("&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt; &amp;") && !/<script/.test(out.svg), out.svg);
  ok(!/javascript/.test(out.svg), "a reference spelling a link out isn't a paint");
  refused(svg("<text>&#0;</text>"), /isn't a character/);
  refused(svg("<text>&#xD800;</text>"), /isn't a character/);
});

await test("<svg> inside the cover is refused; the root must be <svg> with a viewBox, alone", () => {
  refused(svg('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'), /<svg> inside/);
  refused(svg('<g><svg viewBox="0 0 1 1"/></g>'), /<svg> inside/);
  refused('<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>', /one <svg>/);
  refused('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', /viewBox/);
  refused('<svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 1 1"/>', /viewBox/);
  refused(svg("") + svg(""), /one <svg>/);
  refused("hello" + svg(""), /outside the <svg>/);
  refused("<html><body>" + svg("") + "</body></html>", /one <svg>/);
});

await test("markup that isn't well formed is refused", () => {
  refused(svg("<g><rect width='1' height='1'></g>"), /doesn't close/);
  refused(svg("<g>"), /doesn't close|never closed/);
  refused('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><g>', /never closed/);
  refused(svg('<rect width="1" width="2"/>'), /twice/);
  refused(svg('<rect width="1"height="2"/>'), /separated by spaces/);
  refused(svg('<rect width=1 height="2"/>'), /isn't well formed/);
  refused(svg('<rect fill="a<b"/>'), /holds a </);
  refused(svg('<rect fill="ab/>'), /never ends/);
  refused(svg("<!-- never ends"), /never ends/);
});

await test("the limits: size, one attribute, elements, depth", () => {
  refused(svg(`<path d="${"M0 0 ".repeat(14_000)}"/>`), /at most 64 KB/);
  refused(svg(`<path d="${"M0 0 L".repeat(3_000)}"/>`), /longer than/);
  refused(svg('<rect width="1" height="1"/>'.repeat(COVER_LIMITS.elements + 1)), /More than/);
  refused(svg("<g>".repeat(COVER_LIMITS.depth + 1) + "</g>".repeat(COVER_LIMITS.depth + 1)), /deeper/);
  kept(svg("<g>".repeat(COVER_LIMITS.depth - 2) + '<rect width="1" height="1"/>' + "</g>".repeat(COVER_LIMITS.depth - 2)));
});

await test("values that would make a pattern slow stay fast, kept or left out", () => {
  quick(() => kept(svg(`<g transform="${"translate(1 1)" + " ".repeat(15_000)}!"/>`)));
  quick(() => kept(svg(`<g transform="${"rotate(1) ".repeat(1400)}x"/>`)));
  quick(() => kept(svg(`<polygon points="${"1".repeat(15_000)}x"/>`)));
  quick(() => kept(svg(`<polygon points="${"1 ".repeat(7_000)}x"/>`)));
  quick(() => kept(svg(`<rect width="${"9".repeat(15_000)}e" height="1"/>`)));
  quick(() => kept(svg(`<rect fill="rgb(${"1".repeat(15_000)}" width="1" height="1"/>`)));
  quick(() => kept(svg(`<path d="${"M0 0 ".repeat(3_000)}"/>`)));
  quick(() => refused(svg("<g>".repeat(5_000)), /deeper/));
});

await test("Codex's review: thousands of attributes on one element are refused at once, not read in time that grows with their square", () => {
  // The review's own input: 9,300 attributes under 64 KB took up to 444 ms when each name was checked against a list.
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.";
  const names = [];
  outer: for (const a of chars) for (const b of chars) for (const c of chars) {
    names.push(a + b + c);
    if (names.length === 9300) break outer;
  }
  const input = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"${names.map((name) => ` ${name}=""`).join("")}/>`;
  ok(new TextEncoder().encode(input).length < COVER_LIMITS.bytes, "under the size limit");
  quick(() => refused(input, /more than 64 attributes/), 20);
  kept(svg(`<rect ${Array.from({ length: 30 }, (_, i) => `x${i}="1"`).join(" ")} width="1" height="1"/>`));
  refused(svg('<rect 1x="1" width="1" height="1"/>'), /attribute name .* isn't well formed/);
});

await test("Codex's review, held: double encoding stays text, a byte-order mark or a lookalike name changes nothing", () => {
  const out = kept(svg('<text x="1" y="1">&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;</text>'));
  ok(out.svg.includes("&amp;lt;script&amp;gt;") && !out.svg.includes("<script"), out.svg);
  const bom = kept("\ufeff" + svg('<rect width="1" height="1"/>'));
  ok(bom.svg.startsWith("<svg ") && !bom.svg.includes("\ufeff"), "a leading byte-order mark is left out");
  // Names are ASCII: a lookalike letter (Cyrillic і, о) makes one that isn't well formed, so the cover is refused.
  refused(svg("<scrіpt>alert(1)</scrіpt>"), /element's name isn't well formed/);
  refused(svg('<rect width="1" height="1" оnload="alert(2)"/>'), /attribute name .* isn't well formed/);
});

await test("control characters never reach the cover; text outside text elements is left out", () => {
  const out = kept(svg('<text x="1" y="1">a\u0001b\u001fc\u007fd</text><g>stray words</g><rect width="1" height="1"/>'));
  ok(out.svg.includes(">abcd</text>") && !out.svg.includes("stray"), out.svg);
  ok(out.dropped.some((d) => d.includes("text inside <g>")), JSON.stringify(out.dropped));
});

await test("a value that isn't its kind is left out, and said", () => {
  const out = kept(svg('<rect width="calc(1px)" height="1" fill="expression(alert(1))" stroke-linecap="banana" opacity="0.5" font-family="a(b)"/>'));
  ok(!/calc|expression|banana|a\(b\)/.test(out.svg) && out.svg.includes('opacity="0.5"'), out.svg);
  ok(out.dropped.length >= 4, JSON.stringify(out.dropped));
});

await test("not text, or too big before reading, is refused; the file name is the content's hash", async () => {
  refused(JSON.parse('{"toString": null}'), /SVG text/);
  refused(null, /SVG text/);
  refused("x".repeat(COVER_LIMITS.bytes + 1), /at most/);
  const { svg: clean } = kept(svg('<rect width="1" height="1"/>'));
  const file = await coverFile(clean);
  ok(COVER_FILE.test(file) && file === (await coverFile(clean)), file);
  ok(file !== (await coverFile(clean.replace('width="1"', 'width="2"'))), "a different cover, a different name");
});

await test("everything written out, from every test: nothing that runs, links or reaches out", () => {
  ok(outputs.length > 20, `${outputs.length} outputs`);
  for (const out of outputs) {
    ok(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ') && out.endsWith("</svg>"), out.slice(0, 120));
    ok(!/<script|\son[a-z]+\s*=|href|javascript:|https?:\/\/(?!www\.w3\.org\/2000\/svg")|data:|<!|<\?|xmlns:|<style|<foreignObject|<use|<image|<iframe|<a[\s>]/i.test(out), out.slice(0, 300));
    ok(!/url\((?!\s*#)/.test(out), `an outside url(): ${out.slice(0, 200)}`);
  }
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);

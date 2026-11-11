// A text's cover, as SVG your AI draws: checked the same way on the server and on the device, and shown only as <img>.
// Pure (no DOM), so the Worker runs it too. It reads a strict subset of XML and keeps only an allowlist of shapes,
// text and gradients, each attribute's value checked by its kind; the cover kept is written out again from what was
// kept, never passed through. Covers are personal: they stay on your devices, and nothing shared ever carries one.
//
// Refused outright (CoverError, with why): no root <svg> with a viewBox; a DOCTYPE, an entity other than the five XML
// ones or a character reference; CDATA; a processing instruction other than the leading XML declaration; <svg> inside
// it; markup that isn't well formed; more than the limits.
// Left out (said in `dropped`): any other element with everything inside it (script, style, use, image, a,
// foreignObject, filter, pattern, mask, animation, anything namespaced…), and any attribute not on the list (a
// namespaced one such as xlink:href included) or whose value isn't its kind. The root's namespace declarations are
// read and not kept: the cover written out declares only SVG's.
// Every pattern a value is checked with matches in one way only, so no value can make the check slow.

export const COVER_LIMITS = { bytes: 64 * 1024, elements: 2000, depth: 32, attributes: 64, attribute: 16 * 1024, text: 2000 };
export const COVER_TYPE = "image/svg+xml";

export class CoverError extends Error {}

const SVG_NS = "http://www.w3.org/2000/svg";
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const NUMBER = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?";
const LENGTH = new RegExp(`^${NUMBER}(?:px|%|em|ex|pt|cm|mm|in)?$`);
const NUMBERS = new RegExp(`^\\s*${NUMBER}(?:(?:\\s*,\\s*|\\s+)${NUMBER})*\\s*$`);
const OPACITY = new RegExp(`^${NUMBER}%?$`);
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/;
const TRANSFORM_FUNCTION = `(?:matrix|translate|scale|rotate|skewX|skewY)\\(\\s*${NUMBER}(?:(?:\\s*,\\s*|\\s+)${NUMBER}){0,5}\\s*\\)`;
const TRANSFORM = new RegExp(`^${TRANSFORM_FUNCTION}(?:(?:\\s*,\\s*|\\s+)${TRANSFORM_FUNCTION})*$`);
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOR_FUNCTION = new RegExp(`^(?:rgba?|hsla?)\\(\\s*${NUMBER}%?(?:deg)?(?:(?:\\s*,\\s*|\\s+)${NUMBER}%?){2}(?:\\s*[,/]\\s*${NUMBER}%?)?\\s*\\)$`);
const KEYWORD = /^[a-zA-Z]{3,20}$/;
const LOCAL_URL = /^url\(\s*#([A-Za-z][A-Za-z0-9_-]{0,63})\s*\)$/;
const FONT_FAMILY = /^[A-Za-z0-9 ,'"-]{1,120}$/;

const paint = (v) => v === "none" || v === "currentColor" || HEX.test(v) || COLOR_FUNCTION.test(v) || LOCAL_URL.test(v) || (KEYWORD.test(v) && v.toLowerCase() !== "inherit");
const oneOf = (...values) => (v) => values.includes(v);

// What each attribute's value may be.
const KINDS = {
  length: (v) => LENGTH.test(v),
  numbers: (v) => NUMBERS.test(v),
  opacity: (v) => OPACITY.test(v),
  paint,
  path: (v) => PATH_DATA.test(v),
  transform: (v) => TRANSFORM.test(v),
  id: (v) => ID.test(v),
  clip: (v) => v === "none" || LOCAL_URL.test(v),
  font: (v) => FONT_FAMILY.test(v),
  fontSize: (v) => LENGTH.test(v),
  fontWeight: (v) => /^(?:normal|bold|bolder|lighter|[1-9]00)$/.test(v),
  fontStyle: oneOf("normal", "italic", "oblique"),
  anchor: oneOf("start", "middle", "end"),
  baseline: oneOf("auto", "middle", "central", "hanging", "alphabetic", "ideographic", "mathematical", "text-before-edge", "text-after-edge"),
  cap: oneOf("butt", "round", "square"),
  join: oneOf("miter", "round", "bevel", "arcs", "miter-clip"),
  rule: oneOf("nonzero", "evenodd"),
  units: oneOf("userSpaceOnUse", "objectBoundingBox"),
  spread: oneOf("pad", "reflect", "repeat"),
  aspect: (v) => /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(v),
  dash: (v) => v === "none" || NUMBERS.test(v),
  spacing: (v) => v === "normal" || LENGTH.test(v),
};

const PRESENTATION = {
  fill: "paint",
  stroke: "paint",
  "stroke-width": "length",
  "stroke-linecap": "cap",
  "stroke-linejoin": "join",
  "stroke-dasharray": "dash",
  "stroke-dashoffset": "length",
  "stroke-miterlimit": "length",
  "stroke-opacity": "opacity",
  "fill-opacity": "opacity",
  "fill-rule": "rule",
  "clip-rule": "rule",
  "clip-path": "clip",
  opacity: "opacity",
  transform: "transform",
  id: "id",
};
const TEXT_STYLE = {
  "font-family": "font",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "font-style": "fontStyle",
  "text-anchor": "anchor",
  "dominant-baseline": "baseline",
  "letter-spacing": "spacing",
};
const GRADIENT = { id: "id", gradientUnits: "units", gradientTransform: "transform", spreadMethod: "spread" };

// The elements kept, each with its attributes (name → kind) and whether text inside it is kept.
const ELEMENTS = {
  g: { attributes: { ...PRESENTATION, ...TEXT_STYLE } },
  defs: { attributes: {} },
  title: { attributes: {}, text: true },
  desc: { attributes: {}, text: true },
  path: { attributes: { ...PRESENTATION, d: "path" } },
  rect: { attributes: { ...PRESENTATION, x: "length", y: "length", width: "length", height: "length", rx: "length", ry: "length" } },
  circle: { attributes: { ...PRESENTATION, cx: "length", cy: "length", r: "length" } },
  ellipse: { attributes: { ...PRESENTATION, cx: "length", cy: "length", rx: "length", ry: "length" } },
  line: { attributes: { ...PRESENTATION, x1: "length", y1: "length", x2: "length", y2: "length" } },
  polyline: { attributes: { ...PRESENTATION, points: "numbers" } },
  polygon: { attributes: { ...PRESENTATION, points: "numbers" } },
  text: { attributes: { ...PRESENTATION, ...TEXT_STYLE, x: "numbers", y: "numbers", dx: "numbers", dy: "numbers" }, text: true },
  tspan: { attributes: { ...PRESENTATION, ...TEXT_STYLE, x: "numbers", y: "numbers", dx: "numbers", dy: "numbers" }, text: true },
  linearGradient: { attributes: { ...GRADIENT, x1: "length", y1: "length", x2: "length", y2: "length" } },
  radialGradient: { attributes: { ...GRADIENT, cx: "length", cy: "length", r: "length", fx: "length", fy: "length" } },
  stop: { attributes: { offset: "opacity", "stop-color": "paint", "stop-opacity": "opacity" } },
  clipPath: { attributes: { id: "id", clipPathUnits: "units", transform: "transform" } },
};
const ROOT = { ...PRESENTATION, ...TEXT_STYLE, viewBox: "numbers", width: "length", height: "length", preserveAspectRatio: "aspect" };

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Text with its entity and character references read; anything else after & is refused. */
function decode(raw, where) {
  return raw.replace(/&([^;\s&<]{0,12});?/g, (match, name) => {
    if (!match.endsWith(";")) throw new CoverError(`${where}: a bare & (write &amp;).`);
    if (Object.hasOwn(XML_ENTITIES, name)) return XML_ENTITIES[name];
    const code = /^#x([0-9a-fA-F]{1,6})$/.test(name) ? parseInt(name.slice(2), 16) : /^#([0-9]{1,7})$/.test(name) ? Number(name.slice(1)) : NaN;
    if (!Number.isInteger(code) || code < 0x20 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new CoverError(`${where}: "${match}" isn't a character a cover may use.`);
    return String.fromCodePoint(code);
  });
}

// Characters XML doesn't allow, and other control characters: never written out.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/g;
const escapeText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text) => escapeText(text).replace(/"/g, "&quot;");

/** Reads the markup into a tree: { name, attributes: [[name, value]], children: [node | string] }. Throws CoverError. */
function parse(source) {
  let at = 0;
  const root = { name: "#document", attributes: [], children: [] };
  const stack = [root];
  let elements = 0;
  const fail = (message) => {
    throw new CoverError(`${message} (at character ${at}).`);
  };
  const xmlDeclaration = /^\s*<\?xml\s[^?<>]*\?>/.exec(source);
  if (xmlDeclaration) at = xmlDeclaration[0].length;
  while (at < source.length) {
    const lt = source.indexOf("<", at);
    const text = source.slice(at, lt < 0 ? source.length : lt);
    if (text) stack.at(-1).children.push(decode(text, "Text"));
    if (lt < 0) break;
    at = lt;
    if (source.startsWith("<!--", at)) {
      const end = source.indexOf("-->", at + 4);
      if (end < 0) fail("A comment that never ends");
      at = end + 3;
      continue;
    }
    if (source.startsWith("<!", at)) fail("A DOCTYPE, CDATA or declaration isn't allowed in a cover");
    if (source.startsWith("<?", at)) fail("A processing instruction isn't allowed in a cover");
    if (source.startsWith("</", at)) {
      const close = /^<\/([^\s>]+)\s*>/.exec(source.slice(at, at + 200));
      if (!close) fail("A closing tag isn't well formed");
      const open = stack.pop();
      if (!open || open === root || open.name !== close[1]) fail(`</${close[1].slice(0, 40)}> doesn't close <${open?.name ?? "nothing"}>`);
      at += close[0].length;
      continue;
    }
    const tag = /^<([^\s/>]+)/.exec(source.slice(at, at + 200));
    if (!tag || !NAME.test(tag[1])) fail("An element's name isn't well formed");
    at += tag[0].length;
    const node = { name: tag[1], attributes: [], children: [] };
    // Each name once, checked in a set (a list would make a tag with thousands of attributes slow to read).
    const names = new Set();
    for (;;) {
      const space = /^\s*/.exec(source.slice(at, at + 1000))[0];
      at += space.length;
      if (source.startsWith("/>", at)) {
        at += 2;
        stack.at(-1).children.push(node);
        break;
      }
      if (source[at] === ">") {
        at += 1;
        stack.at(-1).children.push(node);
        stack.push(node);
        break;
      }
      if (!space) fail(`Attributes of <${node.name}> must be separated by spaces`);
      // name="value" or name='value': the value runs to its closing quote, and may not hold a <.
      const start = /^([^\s=/>]+)\s*=\s*(["'])/.exec(source.slice(at, at + 300));
      if (!start) fail(`An attribute of <${node.name}> isn't well formed (name="value")`);
      const name = start[1];
      if (!NAME.test(name)) fail(`An attribute name of <${node.name}> isn't well formed`);
      if (names.has(name)) fail(`<${node.name}> has ${name} twice`);
      if (names.size >= COVER_LIMITS.attributes) fail(`<${node.name}> has more than ${COVER_LIMITS.attributes} attributes`);
      names.add(name);
      const end = source.indexOf(start[2], at + start[0].length);
      if (end < 0) fail(`<${node.name}> ${name.slice(0, 40)}'s value never ends`);
      const raw = source.slice(at + start[0].length, end);
      if (raw.length > COVER_LIMITS.attribute) fail(`<${node.name}> ${name.slice(0, 40)} is longer than ${COVER_LIMITS.attribute} characters`);
      if (raw.includes("<")) fail(`<${node.name}> ${name.slice(0, 40)}'s value holds a < (write &lt;)`);
      node.attributes.push([name, decode(raw, `<${node.name}> ${name.slice(0, 40)}`)]);
      at = end + 1;
    }
    if (++elements > COVER_LIMITS.elements) fail(`More than ${COVER_LIMITS.elements} elements`);
    if (stack.length > COVER_LIMITS.depth + 1) fail(`Nested deeper than ${COVER_LIMITS.depth}`);
  }
  if (stack.length !== 1) fail(`<${stack.at(-1).name}> is never closed`);
  return root;
}

/**
 * Checks a cover and writes it out again from what's kept. input: the SVG's text. Returns { svg, dropped: [what] };
 * throws CoverError (with what's wrong, for whoever made it) when it can't be a cover at all.
 */
export function cleanCover(input) {
  if (typeof input !== "string") throw new CoverError("A cover is SVG text.");
  if (new TextEncoder().encode(input).length > COVER_LIMITS.bytes) throw new CoverError(`A cover is at most ${COVER_LIMITS.bytes / 1024} KB.`);
  const tree = parse(input);
  const elements = tree.children.filter((child) => typeof child !== "string");
  if (tree.children.some((child) => typeof child === "string" && child.trim())) throw new CoverError("Text outside the <svg> element.");
  if (elements.length !== 1 || elements[0].name !== "svg") throw new CoverError("A cover is one <svg> element.");
  const svg = elements[0];
  const dropped = new Set();
  const attributesOf = (node, allowed) => {
    const out = [];
    for (const [name, value] of node.attributes) {
      if (node === svg && name === "xmlns") {
        if (value !== SVG_NS) throw new CoverError(`The root's xmlns must be ${SVG_NS}.`);
        continue;
      }
      if (node === svg && (name === "version" || name.startsWith("xmlns:"))) continue;
      const kind = !name.includes(":") && Object.hasOwn(allowed, name) ? KINDS[allowed[name]] : null;
      if (!kind) dropped.add(`the ${name.slice(0, 40)} attribute`);
      else if (!kind(value.trim())) dropped.add(`a ${name} value that isn't one (${value.slice(0, 40)})`);
      else out.push([name, value.trim()]);
    }
    return out;
  };
  const rootAttributes = attributesOf(svg, ROOT);
  const viewBox = rootAttributes.find(([name]) => name === "viewBox")?.[1];
  if (!viewBox || viewBox.trim().split(/[\s,]+/).length !== 4) throw new CoverError("The <svg> needs a viewBox of four numbers.");
  const write = (node, depth) =>
    node.children
      .map((child) => {
        if (typeof child === "string") {
          if (!ELEMENTS[node.name]?.text) {
            if (child.trim()) dropped.add(`text inside <${node.name}>`);
            return "";
          }
          return escapeText(child.replace(CONTROL, "").slice(0, COVER_LIMITS.text));
        }
        if (child.name === "svg") throw new CoverError("An <svg> inside the cover isn't allowed.");
        const known = ELEMENTS[child.name];
        if (!known) {
          dropped.add(`<${child.name.slice(0, 40)}> and what's inside it`);
          return "";
        }
        const attributes = attributesOf(child, known.attributes);
        const open = `<${child.name}${attributes.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("")}`;
        const inner = write(child, depth + 1);
        return inner ? `${open}>${inner}</${child.name}>` : `${open}/>`;
      })
      .join("");
  const body = write(svg, 1);
  const out = `<svg xmlns="${SVG_NS}"${rootAttributes.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("")}>${body}</svg>`;
  return { svg: out, dropped: [...dropped] };
}

/** A cover's file name in store.js's pictures and on the server: its content's sha256 (16 hex) and .svg. */
export async function coverFile(svg) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(svg));
  return `${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16)}.svg`;
}
export const COVER_FILE = /^[0-9a-f]{16}\.svg$/;

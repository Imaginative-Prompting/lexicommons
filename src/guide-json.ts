// How the AI guides (pack-guide.ts, text-guide.ts, weave-guide.ts) show a value: JSON as it's sent, two spaces in, with a list or an object
// that fits in a line kept on one ({ "w": "Down,", "target": "Omlaag,", "lemma": "omlaag" }), so an example reads as the thing it is rather
// than one value a line. It parses back to the same value (scripts/test-guides.mjs).

const WIDTH = 130;

const inline = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.length ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(value) ?? "null";
};

/** value as JSON for a guide; indent is the line's own, so a nested value knows how much room it has. */
export function shownJson(value: unknown, indent = ""): string {
  const one = inline(value);
  if (!value || typeof value !== "object" || indent.length + one.length <= WIDTH) return one;
  const inner = `${indent}  `;
  if (Array.isArray(value)) return `[\n${value.map((v) => `${inner}${shownJson(v, inner)}`).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${shownJson(v, inner)}`).join(",\n")}\n${indent}}`;
}

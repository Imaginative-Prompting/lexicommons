// A milestone's share card: a picture drawn on the device (1080 × 1350, the shape every feed
// shows whole) with the milestone, the language and lexicommons.com, shared through the system's share sheet (Web Share
// with a file) or, where there's none, saved. Tinta stands in CHARACTER_BOX, the upper half, delighted (its `right`
// still, from lex-character's rig: tintaForCard), in its own ink, with the words under it; when its still can't be
// had, the words stand centered between the frame and lexicommons.com, never low under an empty half. The rest is
// monochrome, in the app's own ink and canvas, so a theme's colors don't reach it (a shared picture should read
// anywhere).

export const SIZE = { width: 1080, height: 1350 };
export const CHARACTER_BOX = { x: 340, y: 170, width: 400, height: 400 };
const FRAME = 48; // the quiet frame's line, 4 px wide on it: its inside edge is at 50
const FOOT = SIZE.height - 120; // lexicommons.com's baseline
const UNDER_CHARACTER = 860; // the number's baseline under the character
const INK = "#f3f1ec";
const DIM = "#a7a39a";

/** The card as a PNG Blob: { big ("30"), title ("days in a row"), line ("Learning Dutch on Lexicommons"), character }.
 *  character, once there is one, is a picture (an image, a canvas or a bitmap) drawn in CHARACTER_BOX. */
export async function drawShareCard({ big, title, line, character = null }) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE.width;
  canvas.height = SIZE.height;
  const g = canvas.getContext("2d");
  g.fillStyle = "#0d0d0c";
  g.fillRect(0, 0, SIZE.width, SIZE.height);
  // A quiet frame.
  g.strokeStyle = "#2b2a27";
  g.lineWidth = 4;
  g.strokeRect(FRAME, FRAME, SIZE.width - 2 * FRAME, SIZE.height - 2 * FRAME);
  // The fonts the app already has (tokens.css: Geist Mono for the number, Onest and Instrument Sans).
  await document.fonts?.ready?.catch?.(() => {});
  const face = (weight, size, family) => `${weight} ${size}px ${family}`;
  // The words, each with its baseline's distance below the one before.
  const words = [
    { text: String(big), font: face(600, 300, '"Geist Mono", ui-monospace, monospace'), fill: INK, after: 0 },
    { text: title, font: face(500, 76, '"Onest", "Instrument Sans", system-ui, sans-serif'), fill: INK, after: 120 },
    { text: line, font: face(400, 44, '"Instrument Sans", system-ui, sans-serif'), fill: DIM, after: 90 },
  ];
  const foot = { text: "lexicommons.com", font: face(500, 40, '"Instrument Sans", system-ui, sans-serif'), fill: DIM };
  g.textAlign = "center";
  let baseline = UNDER_CHARACTER;
  if (character) {
    // At its own shape, as large as the box allows, standing on the box's floor (just above the number).
    const w = character.naturalWidth || character.width || CHARACTER_BOX.width;
    const h = character.naturalHeight || character.height || CHARACTER_BOX.height;
    const k = Math.min(CHARACTER_BOX.width / w, CHARACTER_BOX.height / h);
    g.drawImage(character, CHARACTER_BOX.x + (CHARACTER_BOX.width - w * k) / 2, CHARACTER_BOX.y + CHARACTER_BOX.height - h * k, w * k, h * k);
  } else baseline = centeredBaseline(g, words, foot);
  for (const w of [...words, { ...foot, at: FOOT }]) {
    baseline = w.at ?? baseline + w.after;
    g.font = w.font;
    g.fillStyle = w.fill;
    g.fillText(w.text, SIZE.width / 2, baseline);
  }
  return new Promise((done) => canvas.toBlob((blob) => done(blob), "image/png"));
}

// The first baseline that centers the words' ink in the room between the frame's inside edge and the top of
// lexicommons.com, as the canvas measures that ink in these fonts (never a guess at a font's height).
function centeredBaseline(g, words, foot) {
  const ink = (w) => {
    g.font = w.font;
    const m = g.measureText(w.text);
    return { up: m.actualBoundingBoxAscent, down: m.actualBoundingBoxDescent };
  };
  const top = FRAME + 2;
  const bottom = FOOT - ink(foot).up;
  const up = ink(words[0]).up;
  const height = up + words.reduce((sum, w) => sum + w.after, 0) + ink(words.at(-1)).down;
  return Math.round((top + bottom - height) / 2 + up);
}

/**
 * Tinta for the card: its delighted still (lex-character's stillSvg, `right`, in the dark card's ink) as a picture to
 * draw, or null when it can't be had (the card then centers its words).
 */
export async function tintaForCard() {
  try {
    const { stillSvg } = await import("../character/rig/inkdrop/tinta.js");
    const url = URL.createObjectURL(new Blob([stillSvg("right", { palette: "dark", size: CHARACTER_BOX.height })], { type: "image/svg+xml" }));
    try {
      const picture = new Image();
      picture.src = url;
      await picture.decode();
      return picture;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/** Shares the card through the system's sheet, or saves it where there's none. Returns "shared" · "saved" · "canceled". */
export async function shareCard(blob, name = "lexicommons-milestone.png") {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: "lexicommons.com" });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "canceled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}

// A breathing Tinta's sharpening track (character.js startMotion), its own module so Node's test reads exactly what the app plays.
//
// Chromium rasters a composited layer once, at the largest scale its animations reach, and samples that texture under every frame's matrix:
// under idle's near-1 breath he came out 8–15% softer than drawn, at 1×, 2× and 3× (7 Nov 2026). A track on his own scale that reaches DENSER
// for an instant 31 years away makes Chromium raster him that much finer, and sampled down he's as sharp as drawn (1.5: within 1% of drawn at
// every scale; 2 sharpens past it and aliases).
//
// Nothing that ends it can show him larger: its first and last keyframes are 1, so finish(), a seek past its end and cancel all land on 1,
// and DENSER sits between two keyframes an instant apart (Chromium still rasters at it). It's made with the element's own animate(), never
// through lx/motion.js, so a press's finishAll() never sees it. Chromium's alone (userAgentData is Chromium's alone): WebKit's layer is as
// sharp as drawn without it. scripts/test-tinta-sharpen.mjs holds this, and tinta-tabs-check's sharpening stage in the app.

export const DENSER = 1.5;
/** About 31.7 years, in ms. */
export const SHARPEN_FOR = 1e12;
export const SHARPEN = [{ scale: "1" }, { scale: "1", offset: 0.999998 }, { scale: String(DENSER), offset: 0.999999 }, { scale: "1" }];

/** Whether this browser needs it: Chromium's. */
export const sharpens = () => typeof navigator !== "undefined" && "userAgentData" in navigator;

/** Starts it on `node` (a Tinta), or null where it isn't needed. */
export const sharpen = (node) => (sharpens() && typeof node?.animate === "function" ? node.animate(SHARPEN, { duration: SHARPEN_FOR, easing: "linear" }) : null);

// iOS launch images ("splash screens") for the app added to the Home Screen: Safari shows the one whose media query
// matches the device while the app starts. Each is the ink drop on the app's black (public/icons/startup.svg, rendered
// at every size by scripts/build-icons.mjs into public/icons/startup/), placed where the first paint will draw it: with
// the black status bar the page starts below it, so the drop is centered in what's left of the screen, not the screen
// (statusBar, in CSS px; measured on an iPhone 17, 62, the rest from each model's safe area: half an error is the shift).
// iOS keeps the image it took when the app was added to the Home Screen. Android makes its own splash from the manifest's
// background_color and icon. Devices not listed (models after this list) start on plain black.
//
// Each image has two tags. iOS 27 reads device-height in these queries as Safari's window height when the app is added (WebKit
// bug 326500, open since 6 Oct 2026: 660–669 on a 13 mini, not 812), so a query that names the screen's height never matches
// there and the app starts on black. After each exact tag comes its fallback: the same width, ratio and orientation, and a
// device-height strictly between the next smaller screen of that width and ratio and its own. A correct engine's
// device-height is a screen's, so only the exact tags match there; iOS 27's window height is under its screen's, so it takes
// the fallback. Either way a device matches its own image and no other.
//
// One list for everything: the sign-in pages (src/pages.ts) put these tags in their <head>, and build-icons.mjs both
// renders the images and writes the same tags into public/index.html and public/app/index.html.

export type StartupDevice = { w: number; h: number; dpr: number; statusBar: number; landscape?: boolean; note: string };

/** CSS width × height in portrait, and the device pixel ratio. iPads get landscape images too. */
export const STARTUP_DEVICES: StartupDevice[] = [
  { w: 440, h: 956, dpr: 3, statusBar: 62, note: "iPhone 16 Pro Max, 17 Pro Max" },
  { w: 402, h: 874, dpr: 3, statusBar: 62, note: "iPhone 16 Pro, 17, 17 Pro" },
  { w: 420, h: 912, dpr: 3, statusBar: 68, note: "iPhone Air" },
  { w: 430, h: 932, dpr: 3, statusBar: 59, note: "iPhone 16 Plus, 15 Plus, 15 Pro Max, 14 Pro Max" },
  { w: 393, h: 852, dpr: 3, statusBar: 59, note: "iPhone 16, 15, 15 Pro, 14 Pro" },
  { w: 428, h: 926, dpr: 3, statusBar: 47, note: "iPhone 14 Plus, 13 Pro Max, 12 Pro Max" },
  { w: 390, h: 844, dpr: 3, statusBar: 47, note: "iPhone 16e, 14, 13, 13 Pro, 12, 12 Pro" },
  { w: 375, h: 812, dpr: 3, statusBar: 44, note: "iPhone 13 mini, 12 mini, 11 Pro, XS, X" },
  { w: 414, h: 896, dpr: 3, statusBar: 44, note: "iPhone 11 Pro Max, XS Max" },
  { w: 414, h: 896, dpr: 2, statusBar: 48, note: "iPhone 11, XR" },
  { w: 414, h: 736, dpr: 3, statusBar: 20, note: "iPhone 8 Plus" },
  { w: 375, h: 667, dpr: 2, statusBar: 20, note: "iPhone SE (2nd, 3rd), 8" },
  { w: 320, h: 568, dpr: 2, statusBar: 20, note: "iPhone SE (1st)" },
  { w: 1032, h: 1376, dpr: 2, statusBar: 24, landscape: true, note: "iPad Pro 13-inch (M4)" },
  { w: 1024, h: 1366, dpr: 2, statusBar: 24, landscape: true, note: "iPad Pro 12.9-inch, iPad Air 13-inch" },
  { w: 834, h: 1210, dpr: 2, statusBar: 24, landscape: true, note: "iPad Pro 11-inch (M4)" },
  { w: 834, h: 1194, dpr: 2, statusBar: 24, landscape: true, note: "iPad Pro 11-inch, iPad Air 11-inch" },
  { w: 820, h: 1180, dpr: 2, statusBar: 24, landscape: true, note: "iPad Air 10.9-inch, iPad (10th)" },
  { w: 834, h: 1112, dpr: 2, statusBar: 20, landscape: true, note: "iPad Air (3rd), iPad Pro 10.5-inch" },
  { w: 810, h: 1080, dpr: 2, statusBar: 20, landscape: true, note: "iPad 10.2-inch" },
  { w: 744, h: 1133, dpr: 2, statusBar: 24, landscape: true, note: "iPad mini (6th)" },
  { w: 768, h: 1024, dpr: 2, statusBar: 20, landscape: true, note: "iPad 9.7-inch, iPad mini (5th)" },
];

export type StartupImage = { file: string; px: [number, number]; media: string; fallback: string; statusBarPx: number };

// The fallback's device-height: above the next smaller screen of the same width and ratio, below this one's.
function fallbackHeights(d: StartupDevice): string {
  const below = STARTUP_DEVICES.filter((o) => o.w === d.w && o.dpr === d.dpr && o.h < d.h).reduce((most, o) => Math.max(most, o.h), 0);
  return `${below ? `(min-device-height: ${below + 1}px) and ` : ""}(max-device-height: ${d.h - 1}px)`;
}

/** Every launch image: its file under /icons/startup/, its pixel size, the media query that picks it, and its fallback for iOS 27. */
export function startupImages(): StartupImage[] {
  const out: StartupImage[] = [];
  for (const d of STARTUP_DEVICES) {
    for (const orientation of d.landscape ? (["portrait", "landscape"] as const) : (["portrait"] as const)) {
      const px: [number, number] = orientation === "portrait" ? [d.w * d.dpr, d.h * d.dpr] : [d.h * d.dpr, d.w * d.dpr];
      out.push({
        file: `/icons/startup/${px[0]}x${px[1]}.png`,
        px,
        statusBarPx: d.statusBar * d.dpr,
        media: `(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: ${orientation})`,
        fallback: `(device-width: ${d.w}px) and ${fallbackHeights(d)} and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: ${orientation})`,
      });
    }
  }
  return out;
}

/** The <link> tags, one per line: each image's exact tag, then its fallback. */
export function startupLinks(): string {
  return startupImages()
    .flatMap((s) => [s.media, s.fallback].map((media) => `<link rel="apple-touch-startup-image" media="${media}" href="${s.file}">`))
    .join("\n");
}

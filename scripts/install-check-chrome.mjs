// Installs the one Chrome that checks run on: Chrome for Testing, at the version quiet-browser.mjs pins, under
// ~/.local/share/chrome-for-testing/, outside the app and any copy of it, so every session's checks find the same browser
// and it survives restarts. No install script runs: it downloads Google's zip, checks its hash against the one pinned here,
// unpacks it, confirms the bundle id and version, and only then moves it into place. Google doesn't sign Chrome for Testing
// (it's ad hoc, with no team), so the hash is what ties this to the zip first downloaded from Google's bucket on 4 Nov 2026.
//   node 08-lexicommons/app/scripts/install-check-chrome.mjs        (from the channel repo root, sandbox off)
// To move to a new version: change CHECK_CHROME_VERSION in quiet-browser.mjs, empty ZIP_SHA256 here, run it, and pin the hash
// it prints.
// It's a browser, so once a check has run it, macOS lists "Google Chrome for Testing" under Open With for links, HTML and PDFs.
// The defaults don't change: links and HTML still open in the owner's Chrome, PDFs in Preview.
// To remove it, run this, then delete ~/.local/share/chrome-for-testing (browser checks then refuse until it's installed again):
//   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u \
//     ~/.local/share/chrome-for-testing/*/chrome-mac-arm64/Google\ Chrome\ for\ Testing.app

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { CHECK_CHROME_APP, CHECK_CHROME_BUNDLE, CHECK_CHROME_HOME, CHECK_CHROME_VERSION, checkChromeAt } from "./quiet-browser.mjs";

const ZIP_SHA256 = "8bc590d1b1acac042a000234c768f31830f25a3983a83ed5e067114c87c4cad1";
const URL = `https://storage.googleapis.com/chrome-for-testing-public/${CHECK_CHROME_VERSION}/mac-arm64/chrome-mac-arm64.zip`;

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Only Apple Silicon Macs have a pinned build here.");
if (existsSync(CHECK_CHROME_APP)) {
  checkChromeAt(CHECK_CHROME_APP);
  console.log(`Already installed: ${CHECK_CHROME_APP}`);
  process.exit(0);
}

mkdirSync(CHECK_CHROME_HOME, { recursive: true });
const temp = mkdtempSync(join(CHECK_CHROME_HOME, ".installing-"));
try {
  const zip = join(temp, "chrome-mac-arm64.zip");
  console.log(`Downloading ${URL}`);
  execFileSync("/usr/bin/curl", ["-fsSL", "--retry", "3", "-o", zip, URL], { stdio: "inherit" });
  const hash = createHash("sha256").update(readFileSync(zip)).digest("hex");
  console.log(`sha256 ${hash}`);
  if (ZIP_SHA256 && hash !== ZIP_SHA256) throw new Error(`The zip's hash isn't the pinned one (${ZIP_SHA256}).`);

  const unpacked = join(temp, "unpacked");
  execFileSync("/usr/bin/ditto", ["-x", "-k", zip, unpacked]);
  const app = join(unpacked, "chrome-mac-arm64/Google Chrome for Testing.app");
  const plist = join(app, "Contents/Info.plist");
  const read = (key) => execFileSync("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plist], { encoding: "utf8" }).trim();
  if (read("CFBundleIdentifier") !== CHECK_CHROME_BUNDLE) throw new Error(`Its bundle id is ${read("CFBundleIdentifier")}.`);
  if (read("CFBundleShortVersionString") !== CHECK_CHROME_VERSION) throw new Error(`It's version ${read("CFBundleShortVersionString")}.`);
  // A quarantined app would put a Gatekeeper dialog on the owner's screen the first time a check launched it.
  if (execFileSync("/usr/bin/xattr", [app], { encoding: "utf8" }).includes("com.apple.quarantine")) throw new Error("It's quarantined.");

  mkdirSync(dirname(dirname(CHECK_CHROME_APP)), { recursive: true });
  renameSync(join(unpacked, "chrome-mac-arm64"), dirname(CHECK_CHROME_APP));
  checkChromeAt(CHECK_CHROME_APP);
  console.log(`Installed ${CHECK_CHROME_APP}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

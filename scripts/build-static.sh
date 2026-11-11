#!/bin/zsh
# Rebuilds the vendored and generated static files in public/: the browser passkey library (ES modules, served as
# is), the FSRS scheduler (ts-fsrs), the design-system fonts (from NeedWright's design-system branch), and the PNG app
# icons rendered from public/icons/icon.svg. Safe to re-run.
set -euo pipefail
cd "${0:A:h}/.."

rm -rf public/vendor/simplewebauthn
mkdir -p public/vendor/simplewebauthn
(cd node_modules/@simplewebauthn/browser/esm && find . -name '*.js' -print0 | while IFS= read -r -d '' file; do
  mkdir -p "../../../../public/vendor/simplewebauthn/$(dirname "$file")"
  cp "$file" "../../../../public/vendor/simplewebauthn/$file"
done)
cp node_modules/@simplewebauthn/browser/LICENSE.md public/vendor/simplewebauthn/LICENSE.md 2>/dev/null || true

# ts-fsrs (MIT): the FSRS scheduler (public/js/study/scheduler.js), one self-contained ES module from its npm package at a
# pinned version, checked against the hash it was vendored with.
FSRS_VERSION=5.4.2
FSRS_SHA256=ad4a4b3b7e259fcbf02764454c8f9db4ea3bf5aae2f473198129ecb7728f1a19
fsrs_tmp=$(mktemp -d "${TMPDIR:-/tmp}/ts-fsrs.XXXXXX")
(cd "$fsrs_tmp" && npm pack "ts-fsrs@$FSRS_VERSION" --silent >/dev/null && tar xzf "ts-fsrs-$FSRS_VERSION.tgz")
echo "$FSRS_SHA256  $fsrs_tmp/package/dist/index.mjs" | shasum -a 256 -c - >/dev/null
mkdir -p public/vendor/ts-fsrs
cp "$fsrs_tmp/package/dist/index.mjs" public/vendor/ts-fsrs/index.mjs
cp "$fsrs_tmp/package/LICENSE" public/vendor/ts-fsrs/LICENSE
rm -rf "$fsrs_tmp"

# The Anki parser's two libraries (both MIT), from their npm packages at pinned versions, checked against the hashes they were
# vendored with. Loaded only when someone adds a deck (public/js/anki/), never in the app's shell. sql.js's plain-script build, as a
# worker's importScripts runs it (it isn't strict-mode code, so it can't load as a module).
SQLJS_VERSION=1.15.2
SQLJS_JS_SHA256=17e880ef4c40827f93ead7766ab960937259368a8341b9d231984a7d8f9fbd41
SQLJS_WASM_SHA256=0dfeecda2070b36da0cd4f6afa250af9453de528a983770f85b13d5d6b667572
FZSTD_VERSION=0.1.1
FZSTD_SHA256=1a901fc5a58c349bbdb4f2aa1e688637ef56891ec58243a9f0cd863166b0d2a4
anki_tmp=$(mktemp -d "${TMPDIR:-/tmp}/anki-vendor.XXXXXX")
(cd "$anki_tmp" && npm pack "sql.js@$SQLJS_VERSION" --silent >/dev/null && mkdir sqljs && tar xzf "sql.js-$SQLJS_VERSION.tgz" -C sqljs && npm pack "fzstd@$FZSTD_VERSION" --silent >/dev/null && mkdir fzstd && tar xzf "fzstd-$FZSTD_VERSION.tgz" -C fzstd)
echo "$SQLJS_JS_SHA256  $anki_tmp/sqljs/package/dist/sql-wasm-browser.js" | shasum -a 256 -c - >/dev/null
echo "$SQLJS_WASM_SHA256  $anki_tmp/sqljs/package/dist/sql-wasm-browser.wasm" | shasum -a 256 -c - >/dev/null
echo "$FZSTD_SHA256  $anki_tmp/fzstd/package/esm/index.mjs" | shasum -a 256 -c - >/dev/null
mkdir -p public/vendor/anki
cp "$anki_tmp/sqljs/package/dist/sql-wasm-browser.js" public/vendor/anki/sql-wasm.js
cp "$anki_tmp/sqljs/package/dist/sql-wasm-browser.wasm" public/vendor/anki/sql-wasm.wasm
cp "$anki_tmp/sqljs/package/LICENSE" public/vendor/anki/LICENSE.sql.js
cp "$anki_tmp/fzstd/package/esm/index.mjs" public/vendor/anki/fzstd.mjs
cp "$anki_tmp/fzstd/package/LICENSE" public/vendor/anki/LICENSE.fzstd
rm -rf "$anki_tmp"

mkdir -p public/fonts
NW=~/Documents/GitHub/NeedWright
for font in instrument-sans-var geist-mono-var-latin; do
  git -C "$NW" show "design-system:app/fonts/$font.woff2" > "public/fonts/$font.woff2"
done
# The heading face, Onest (OFL, public/fonts/onest-OFL.txt), is kept in this repo as two subsets of Google Fonts' Onest[wght].ttf
# (sha256 966c5c29b4755da8…), split so a page fetches only the one its letters need (tokens.css' unicode-range):
#   pyftsubset 'Onest[wght].ttf' --unicodes=<the Latin range in tokens.css> --layout-features='*' --flavor=woff2 --output-file=public/fonts/onest-var-latin.woff2
#   pyftsubset 'Onest[wght].ttf' --unicodes=U+0400-052F,U+1C80-1C88,U+2116 --layout-features='*' --flavor=woff2 --output-file=public/fonts/onest-var-cyrillic.woff2

# The icons, from their SVG sources in public/icons/ (the ink drop's), and the iOS launch images with their tags.
node scripts/build-icons.mjs
echo "static files rebuilt"

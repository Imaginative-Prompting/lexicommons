#!/usr/bin/env bash
# Copies the live open library (the lexicommons-library bucket: catalog, books, their pictures, weaves, lists and
# default packs) into a local wrangler state, so a local server's shelf shows the same books as the live site.
# Read-only on the live side.
#
#   scripts/books/seed-local-library.sh <persist dir>      # the --persist-to dir of your wrangler dev
#
# Needs CLOUDFLARE_ACCOUNT_ID=3eab77e293bf5fdf0baadff8d90377a5 and the network (run it outside the command sandbox).
# A local server with nothing seeded still works: its shelf is empty.
set -euo pipefail
persist="${1:?usage: seed-local-library.sh <persist dir>}"
cd "$(dirname "$0")/../.."
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

copy() { # copy <key> <content type>: one file from the live bucket into the local one (stdin kept from the key list)
  npx wrangler r2 object get "lexicommons-library/$1" --file "$work/file" --remote </dev/null >/dev/null
  npx wrangler r2 object put "lexicommons-library/$1" --file "$work/file" --content-type "$2" --local --persist-to "$persist" </dev/null >/dev/null
  echo "  $1"
}

npx wrangler r2 object get lexicommons-library/catalogue.json --file "$work/catalogue.json" --remote >/dev/null
# Every JSON file the catalog points at: each book, each of its layers, each word-frequency list, each default pack.
# Books are listed first, so their pictures can be read from them once they're here.
node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const key = (url) => url.replace(/^\/library\//, "");
for (const b of c.books) console.log("book " + key(b.book));
for (const b of c.books) for (const l of Object.values(b.layers ?? {})) console.log("file " + key(l.url));
for (const l of Object.values(c.lists?.frequency ?? {})) console.log("file " + key(l.url));
for (const packs of Object.values(c.packs ?? {})) for (const p of packs ?? []) {
  console.log("file " + key(p.url));
  // The recordings of a pack: its manifest, then (read from it) every clip it names.
  if (p.audio) console.log("audio " + key(p.audio));
}
' "$work/catalogue.json" > "$work/keys"
: > "$work/pictures"
: > "$work/clips"
count=0
while read -r kind key; do
  copy "$key" application/json
  count=$((count + 1))
  # A picture book names its pictures, shared by hash across books (book-format.js picturePath).
  if [[ $kind == audio ]]; then
    node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); for (const v of Object.values(m.voices ?? {})) for (const e of [...Object.values(v.items ?? {}), ...Object.values(v.words ?? {})]) if (e.clip) console.log(e.clip)' "$work/file" >> "$work/clips"
  fi
  if [[ $kind == book ]]; then
    node -e 'for (const p of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).pictures ?? []) console.log(p.file)' "$work/file" >> "$work/pictures"
  fi
done < "$work/keys"
for file in $(sort -u "$work/pictures"); do
  case "${file##*.}" in jpg) type=image/jpeg ;; png) type=image/png ;; webp) type=image/webp ;; *) echo "a picture of an unknown kind: $file" >&2; exit 1 ;; esac
  copy "pictures/$file" "$type"
  count=$((count + 1))
done
for clip in $(sort -u "$work/clips"); do
  case "${clip##*.}" in mp3) type=audio/mpeg ;; m4a) type=audio/mp4 ;; *) echo "a recording of an unknown kind: $clip" >&2; exit 1 ;; esac
  copy "audio/$clip" "$type"
  count=$((count + 1))
done
npx wrangler r2 object put lexicommons-library/catalogue.json --file "$work/catalogue.json" --content-type application/json --local --persist-to "$persist" >/dev/null
echo "seeded $count file(s) ($(sort -u "$work/pictures" | grep -c . || true) picture(s), $(sort -u "$work/clips" | grep -c . || true) recording(s)) and the catalog into $persist"

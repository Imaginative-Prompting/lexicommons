# What a new copy's open library starts from

`scripts/local.mjs` puts this in a copy's library, beside the language packs in `../packs/` and the starter inside the app. See `../docs/self-host.md`.

- `catalogue-seed.json`: what these files are, as the main site's catalog lists them (`books`, `lists`, `grammar`, `shelf`), and `seed`: Dutch's pack order, what's opt-in, which opt-in packs Explore may suggest (`suggest`: the category packs, packs about one topic), which pack has recordings.
- Every other file is at its key in the library: `books/`, `pictures/`, `lists/`, `grammar/`. Files are named by their content, and the tool checks each one against its name.

To change what's here, publish through the main site's admin tools first, then copy the file to its key and its entry into `catalogue-seed.json`. `node scripts/test-local-copy.mjs` fails on anything that doesn't pass the app's checks.

**Rights:** the frequency list is CC BY-SA 4.0 with its attribution in the file. The books are public domain or CC BY 4.0, with their credits in the catalog entry and on their pages; those credits must stay.

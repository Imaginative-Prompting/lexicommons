# Books in Explore: the API the app's screens use

The server side is `src/community-books.ts` (migration 0028), with moderation in `src/moderation.ts`. This is the contract the
app is built on:
- Explore's books and the Share page's books (Explore and Share);
- Read's "add from Explore".

A shared book is a book's text with its weave layers: one per language it's woven into (`weave`), or a `help` layer. It's
shared the way a pack is:
- under the same switch (`COMMUNITY_SHARING`), the sharing terms and bans;
- found in Explore, added to someone's reading library (a follow), liked and reported;
- moderated by the same rules as packs: reports, copyright notices, counter-notices, strikes.

## The rules a share meets

The server checks each of these and refuses in plain words. Show `errors[].message` as given; `at` names the field.

| `at` | The rule |
| --- | --- |
| `book` | A valid `lexicommons-book` (`book-format.js validateBook`), at most 2 MB as JSON. The same text can't already be in Explore, or on Lexicommons' shelf. Each account shares a book once: a later change is a new version of that share. |
| `book.rights` | Public domain in both the US and the EU (`rights.us` and `rights.eu`), or CC0 / CC BY 4.0 / CC BY-SA 4.0 with its credit (`rights.spdx` and `rights.attribution`). An NC or ND text is refused. |
| `book.source` | `source.url` (or a `source.ref` that is a link) says where the text came from. It's shown on the book's page. |
| `book.pictures` | Text and weaves only for now: a book with `pictures`, `pages` or a `cover` is refused. |
| `layers[n]` | Each layer passes `validateWeave` against the book and the weave audit (`weave-audit.js`), at most 1 MB each, one per language, at most 12. It's the sharer's own work, under CC BY-SA 4.0. |
| `title`, `level`, `topics` | As for a pack: `level` is A1–C2 or none, and up to 3 topics from Explore's list. |

A book read in on the device has `rights: null` and `source: { kind: "paste" }` (`import-text.js`), so its share is
refused at `book.rights` and `book.source`. The Share page asks for both first:
- whether the text is in the public domain, or which open license it has and whom it credits;
- the link it came from.

**Where it goes.** A book whose source is a known open library goes live at once (`KNOWN_SOURCES` in
`community-books.ts`). Known libraries:
- Project Gutenberg;
- Wikisource;
- StoryWeaver;
- Standard Ebooks;
- African Storybook;
- Global Storybooks.

A book from anywhere else is `pending` until an admin looks at its source (`decide_shared_book`). Only its owner sees
it meanwhile, with its `stateReason`.

**Limits.**
- Each account may share 5 books a day.
- New versions or layers count like a pack's new versions (30 a day; 10 in an account's first week).
- Adding books to a reading library has its own allowance (300 a day; 100 in the first week).
- What an account shares, packs and books together, counts against one room (200 MB; 50 MB in the first week).

## States

| `state` | What it means | Who sees it |
| --- | --- | --- |
| `live` | In Explore; its files are served. | Everyone signed in. |
| `pending` | Waiting for an admin to look at its source. | Its owner. |
| `declined` | An admin said no. `stateReason` says why. | Its owner. |
| `hidden` | Reported, while it's looked at. | Its owner and moderators. |
| `withdrawn` | Its owner took it out of Explore. | Everyone who had it keeps their copy. |
| `removed` | Taken down after a report was upheld. | Its owner and moderators. |

A withdrawn book that reports had taken down carries `down: true`, and only its owner sees it.

Only a `live` book's files are served. A takedown or a withdrawal stops them at once for everyone. A copy already on a
device stays there: Read keeps it, and says it's no longer in Explore.

## Routes

Every route needs a signed-in account; with none it answers 401 `{ "error": "sign_in_required" }`. Changes are sent from
the app's own pages, under the same-site rule as every other change. Other refusals:
- 400 `{ error }`: a refusal in words;
- 403 `{ error }`: the terms not accepted, a ban, or sharing not open yet. `GET /api/me`'s `mayShare` says whether sharing is open to this
  account (`COMMUNITY_SHARING`: "admins" at launch, then "everyone"): while it's false, the app shows no way to share a book;
- 429 `{ error }`: a day's limit, with `Retry-After`.

| Route | What it does | Answer |
| --- | --- | --- |
| `GET /api/community/books?learning=&lang=&layer=&level=&topic=&q=&sort=popular\|new&offset=` | Explore's books. Each filter is optional: `learning` is a book in that language or woven into it, `lang` the book's language, `layer` a layer's language. | `{ books: BookView[], next? }` (20 a page; `next` is the next `offset`) |
| `GET /api/community/books/:id` | A book's page. | `{ book: BookView (+ down?, work?), sample, versions, meta? }`, or 404 |
| `GET /api/community/books/following` | The books this account added from Explore. | `{ books: SharedBookMeta[], down: [{ id, title, state }] }` |
| `GET /api/community/books/mine` | What this account shared as books, every state. | `(BookView & { sourceId, down? })[]` |
| `POST /api/community/books/:id/follow` | Add it to this account's reading library. | `SharedBookMeta` |
| `DELETE /api/community/books/:id/follow` | Stop its new versions coming. | `{ id, following: false }` |
| `POST` / `DELETE /api/community/books/:id/like` | Like it, or take the like back (the app only). | `{ id, liked, likes }` |
| `POST /api/community/books/share` | Share a book. | 200 `{ shared: true, id, version, state, layers, page, notes }`, or 422 `{ shared: false, errors: [{ at, message }] }` |
| `POST /api/community/books/:id/update` | A new version, or new metadata. | 200 `{ updated: true, id, version, newVersion, seq?, layers?, changes?, notes? }`, or 422 `{ updated: false, errors }` |
| `POST /api/community/books/:id/withdraw` | Take it out of Explore (live or pending). | `{ id, state: "withdrawn", note }` |
| `POST /api/community/books/:id/report` | Report it. A copyright notice is filed only here. | `{ reported, id, hidden, note }` |
| `POST /api/community/books/:id/counter-notice` | Its owner answers a report that took it down. | `{ filed, id, note }` |
| `GET /api/community/mine/cases` | What happened to this account's hidden packs and books. A book's case carries `kind: "book"`. | as for packs |
| `GET /api/community/books/:id/:version/:file` | A version's file (`book.json`, or `<kind>.<lang>.<hash>.json`). Served only while the book is live, private, revalidated on every fetch. | the JSON, or 404 |

**The bodies.**
- **Share:** `{ book, layers?: [weave…], title?, about?, level?, topics?, note? }`. The whole body is up to 2 MB plus 12
  MB of layers.
- **Update:** `{ book?, layers?, dropLayers?: [lang…], title?, about?, level?, topics?, note? }`.
  - A new text (`book` at another version) holds only the layers sent with it. `notes` says which layers were left on
    the text before.
  - The same text with `layers` adds layers, or puts a new one in place of the one into the same language.
  - `dropLayers` takes layers off.
  - With none of those, it changes only `title`, `about`, `level` and `topics`, with no new version.
  - A new text keeps the book's language, and its source (or comes from another known library).
- **Report:** `{ reason, details?, notice? }`. `reason` is one of copyright, minors, illegal, abuse, spam, personal or
  other. A copyright notice is `notice: { name, contact, work, statement: true }`, as for a pack.
- **Counter-notice:** `{ statement, name, email }`, as for a pack.

## Shapes

**`BookView`** is a book as a list or its page shows it:

```js
{
  id, kind: "book", title, authors: [{ name, role? }], about, by /* the sharer's name, or "a former member" */, mine,
  language /* the book's */, layers: ["nl", …] /* the languages its current version is woven into */, level,
  topics: [{ id, name }],
  rights: { line /* "Public domain in the US and the EU", or "CC BY 4.0: <its credit>" */, publicDomain, spdx? },
  source: { url, name? /* a known library's name */ }, licence /* the layers': "CC BY-SA 4.0" */, version,
  likes, follows, following /* in this account's reading library */, liked, state, stateReason?, sharedAt, updatedAt,
}
```

**A book's page** adds:
- `sample`: its first 5 sentences, each `{ sentence, layers?: { <lang>: <that layer's line> } }`;
- `versions`: newest first, each `{ seq, version, layers, note, changes, at }`. A version's `changes` is
  `{ text?: { from, to }, layersAdded, layersReplaced, layersDropped }`;
- `work`: for its owner while a copyright notice holds it down, the work the notice names (never who sent it);
- `meta`: while it's live, what Read needs to add it.

**`SharedBookMeta`** is what Read adds. It's the shape `read/shelf.js fetchOpenBook(meta)` already takes:

```js
{
  id, version /* the book's own version (bookVersion) */, shared: true, title, authors, lang, rights, source: { url },
  words, sentences, chapters, level?,
  book: "/api/community/books/<id>/<version>/book.json",
  layers: { <lang>: { kind: "weave" | "help", url, licence: "CC BY-SA 4.0", credit /* the sharer */, sentences } },
  page: "/app/#explore/book/<id>",
}
```

The files carry the book's public id: `book.id === meta.id`, and each layer's `book` is it too. So
`fetchOpenBook(meta)` checks them exactly as it checks a shelf book: `validateBook`, the id and version, and
`validateWeave` for each layer. The public id is the book's own id, with a suffix when another shared book or the shelf
has that id; `notes` says so.

## What each screen uses

The app's side of Explore and Share is `public/js/explore/books.js` (the home's Books shelf, Books, a book's page, Yours' books, Share a
book), held by `scripts/explore-books-check.mjs`. With no book shared, Explore draws nothing of books: no shelf, no heading, no held place.

**Explore (lex-design-2).**
- Its books: `GET /api/community/books?learning=<the language being learned>`, beside its packs. Each result is
  `kind: "book"`.
- A book's page: `GET /api/community/books/:id`. The server's `page` link proposes `#explore/book/<id>`; the route is
  the UI's to name, and the server only builds that link.
- The page shows:
  - the title and authors;
  - `rights.line`, and `source.url` as a link (with `source.name` when it's a known library);
  - the layers' languages, and the layers' license and credit;
  - the sample, with each layer's line.
- Add to my library: `POST …/follow`, then Read adds the `meta` it answers.
- Like; Report, with the copyright notice form a pack's Report has.

**Share (lex-design-2, G11).**
- Sharing a book from the reading library sends the book and any weave layers the device holds:
  `POST /api/community/books/share`.
- A book read in on the device needs its rights and its link asked first (see the rules above).
- An answer with `state: "pending"` says it's waiting for an admin to look at where its text came from (`notes[]` says
  so in words).
- Yours: `GET /api/community/books/mine`, and the cases from `/api/community/mine/cases`. A `kind: "book"` case is
  answered by `POST /api/community/books/:id/counter-notice`.

**Read's "add from Explore" (lex-design).**
- Adding: books from `GET /api/community/books?learning=<language>` (or the user picks one in Explore), then
  `POST …/follow` and `fetchOpenBook(meta)`. Keep it as a shelf book is kept, with its `meta` (`shared: true`, `page`
  back to Explore).
- Keeping it current: `GET /api/community/books/following` when the app opens and as packs sync. A `meta.version` or
  `layers` that changed is fetched again.
- A book in `down` stays on the device and says it's no longer in Explore:
  - hidden: "hidden while it's looked at";
  - removed: "taken down";
  - withdrawn: "taken out by whoever shared it".
- Removing it from the library can also `DELETE …/follow`.

## Over MCP (what an AI uses)

- `share_upload` takes a book or a layer file too.
- `share_book { book, layers?, title?, about?, level?, topics?, note? }` takes the staged files' sha256s.
- `update_shared_book { id, book?, layers?, drop_layers?, … }`, `withdraw_shared_book { id }` and `my_shared_books`.
- `explore_search` returns `books` beside `items`; `kind: "pack" | "book"` gives one of them.
- `explore_get { book }`, `follow { book }` and `unfollow { book }`.
- `report { book }`, and for a moderator `mod_get` / `mod_hide` / `mod_restore { book }`.
- For an admin: `decide_shared_book { id, decision: "open" | "decline", why }`, with the pending books listed in
  `mod_queue`'s `sharedBooks`.

## Proof

- `node scripts/test-shared-books.mjs`: every rule and state above, on the real migrations.
- `node scripts/books-check.mjs http://localhost:<port> <outDir> --persist-to <dir>`: the same over HTTP and MCP, as an
  AI and a second account.

# Run your own copy

Lexicommons can run entirely on your own computer, from a clone of this repo. Nothing goes through lexicommons.com, and you don't need an account anywhere or an AI.

## What you need

- **Git and Node 24 or newer.** Use Node 24.11 or later to avoid warnings from dependencies during install.
- **macOS or Linux.** It's been run on macOS. Linux should work, but hasn't been tested. On Windows, use WSL.

```sh
git clone <this repo's address> lexicommons
cd lexicommons
npm run local
```

It installs what it needs, makes a database, puts the library in, and prints the address, usually http://localhost:8787/app/. Create an account with a passkey, and Study has lesson 1 waiting. Translate and Read work too. Ctrl-C stops it, and your data stays for next time.

- `npm run local -- --detach` runs it in the background; `npm run local -- stop` stops it.
- `npm run local -- --port <n>` picks another port.

## What's different on your copy

- **Only this computer can open it.** A phone can't reach `localhost`, so there's nothing to sync between devices, and no cloud storage to connect. Settings → Your data can download everything.
- **Signing in takes a passkey,** so you need Touch ID, Windows Hello or a security key. On a computer with none of those (many Linux desktops), it stops at sign-in. Google and GitHub sign-in are off, since their apps only accept the addresses they were registered for.
- **Use Chrome, Edge, Firefox or Safari.** Safari keeps no Secure cookie that `http://localhost` sets, so a copy's server leaves Secure off its cookies there (`scripts/test-local-cookies.mjs`); the main site's are always Secure.
- **Reminders aren't set up.** The app says so if you try to turn them on.
- **"Say it" uses your browser's recognizer** until you fetch the speech models (below).
- **It has its own accounts, Explore and library,** shared with nobody. The library is what's in this repo, at the version you cloned.
- **The in-app AI runs on a key of your own.** In the AI section, Connection: Connect with OpenRouter, or paste an OpenRouter key. Practice then runs right there, and you pay OpenRouter for what you use. The key stays in your browser and goes only to OpenRouter.
- The terms and privacy pages are the main site's, and don't describe a copy on your computer.

## Speech models (optional, about 1 GB)

Whisper lets "Say it" run on your device, offline. The models aren't in the repo.

```sh
npm run local -- speech    # fetched and checked against Hugging Face's hashes
```

## Being an admin

An admin manages the library with the `library_*` tools over MCP (`src/library-admin.ts`). Create your account in the app, then:

```sh
npm run local -- admin     # with several accounts, it lists them; add --user <id>
```

## Updating

```sh
git pull
npm run local
```

Your accounts and everything in them stay. New migrations apply, and new or changed packs and books join your library. A pack your admin changed stays yours, and it says so.

## Removing

```sh
npm run local -- remove    # asks first; --yes skips that
```

It deletes `.state-local/`, the folder holding this copy's database and library, with every account in it.

## Hosting it somewhere else

It's open source, so you can, but we don't support or test that. `wrangler.jsonc` shows what a Cloudflare deployment uses: a Worker, D1, KV, two R2 buckets, a Durable Object, rate limiters and a cron. You'd have to replace its account, ids, routes and origin, and register your own Google, GitHub, Drive, Dropbox and OneDrive apps or go without them. `public/terms.html` and `public/privacy.html` name the main site's operator, so you'd need your own. The library seeding in `scripts/local/` only writes to local storage.

Never run `npm run deploy` or `wrangler deploy` as they stand: `wrangler.jsonc` is the main site's.

## Working on this

- `scripts/local.mjs` does all of the above. `node scripts/test-local-copy.mjs` holds its rules, and `node scripts/local-copy-check.mjs http://localhost:<port> <outDir>` walks a running copy in Chrome as a new learner.
- The browser checks need Chrome for Testing as well as Playwright, which `npm ci` installs with no browser: `node scripts/install-check-chrome.mjs`. Both currently assume an Apple Silicon Mac.
- `library/` is what a new copy's library starts from, beside `packs/` (see `library/README.md`).

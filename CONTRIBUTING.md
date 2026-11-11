# Contributing

Thanks for wanting to help. Issues are welcome: a bug, a wrong sentence in a pack, a language you'd like, an idea.

**How this repository changes.** It's published from the project's working copy, as one commit per release. So a pull request
isn't merged as it is: if we take it, we apply it to the working copy and it arrives in the next release, with you credited in
that commit's message. Small pull requests, one thing each, are the easiest to take.

**Before you send one:**
- Run your own copy (`npm run local`, [docs/self-host.md](docs/self-host.md)) and try what you changed in it.
- `npm run typecheck` must pass, and so must the checks for what you touched. `AGENTS.md` lists every check, what it covers and
  how to run it.
- Packs and the library go through the app's own checks: `node scripts/test-local-copy.mjs`.

**Licenses.** What you contribute is under the same licenses as what it changes: code under the GNU AGPL, version 3
([LICENSE](LICENSE)), content under CC BY-SA 4.0 ([CONTENT-LICENSE.md](CONTENT-LICENSE.md)). Contribute only what you have the
right to share that way.

A security problem goes to [SECURITY.md](SECURITY.md)'s private routes, not an issue.

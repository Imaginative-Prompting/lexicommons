# Practice with your AI

Practice lives in the AI section and is offered only once an AI is connected (`AGENTS.md`, "The app works in full with no AI").

A live practice between the person and their own AI: conversation, role-play, translation, a story, games the AI deals
with fresh sentences, or grammar questions. The person speaks or types in the app; their AI answers, corrects and
grades from its own app (Claude Code, the Claude app, Codex, anything that speaks MCP). Lexicommons runs no model and
pays for none: every reply is the person's AI's.

## How a live exchange works

The site can never call anyone's AI; only the AI calls the site. So both sides wait on the same place, the account's
**practice room**, a Durable Object (`src/practice.ts`, one per account: `PRACTICE.getByName(userId)`):

1. The app starts a practice (`POST /api/practice`: kind, how you'll answer, minutes, topic, the language you're
   learning, and the learner snapshot).
2. The AI calls `practice_wait` with no id. It joins the open practice (or waits for one to open), takes the practice's
   **seat**, and gets the snapshot and any turns so far.
3. The AI answers with `practice_reply` (lines in the practice's language with their literal line and English, English
   notes, a sentence to translate, a role-play scene, a card, its grades of your turns, what you should do next).
4. The app long-polls `GET /api/practice/<id>?after=<seq>&v=<version>&wait=25`: it answers at once when anything changed.
5. Your turn (`POST /api/practice/<id>/turns`, a key per turn so a retry stores once): typed, or said and recognized on
   the device (`public/js/speech/speech.js` with no expected sentence: free speech, plus the words the recognizer
   doubted), or a card's result, or Hint. The AI's held `practice_wait` returns it at once.
6. Either side ends it (`POST /api/practice/<id>/end`, or `practice_end` with a summary). The device saves the practice
   (`public/js/practice/store.js`), records its grades as evidence, and tells the server (`/collected`); the server
   deletes it ten minutes later.

The second way: the person talks to their AI in its own app (typed, or voice mode), and it logs the conversation and
its grades with `practice_log`. An open app follows it live (follow only: you answer in your AI); otherwise the device
collects it next time Practice or Today opens.

### The language

A practice is in one language: the one you're learning when it starts (`settings.language`; one from before practices
had one is Dutch). Your AI is told it on joining (`language`, `languageName`, `locale`) and in `get_learner`, which
is about that language alone; `practice_log` takes one, or uses the language `get_learner` names. The server checks
every reply, summary and log in the practice's language (a German word's lemma keeps its capital, `w:Buch`, as its
packs do); the room draws, speaks and listens in it; its grades and cards become evidence in it, whatever you're
learning when the device collects it. A past practice in another language says which. The guide's examples are Dutch,
and the format's field names (`nl`, `from: "dutch"`) stay the same for every language.

### Ceilings

| | |
|---|---|
| `practice_wait` holds | up to 40 s by default (50 max), so 60 s client timeouts (Codex) are safe |
| The app's poll holds | up to 25 s |
| No practice open | the AI is told to stop after 10 minutes of waiting |
| Nothing happening | a practice ends after 15 minutes with no turn from either side |
| Never joined | ends after 30 minutes |
| Longest | 2 hours, 400 turns |
| Not collected | deleted after 7 days |
| One AI per practice | another AI gets `taken` while the seat's holder has called in the last minute |

## Which AI apps can run a practice (tested 26 Oct)

| App | Result |
|---|---|
| Codex (`codex exec`, MCP over a token) | Whole practice against a scripted learner: joined, graded every turn exactly, summary 15 s after End. Needs `default_tools_approval_mode = "approve"` for the server, or every call stops for approval |
| The Claude app (claude.ai, web) | Whole practice live: joined, graded, waited through a 45-second silence (an empty wait, then another), sent its summary on End. **Asks before every tool call** ("Allow once / Always allow"): the practice runs hands-free only once the person chooses Always allow for Lexicommons |
| Claude Code | The `practise` prompt is `/mcp__lexicommons__practise`. Not yet run against the live site |
| The Claude app on a phone, voice mode | Not tested yet (needs the person's phone) |

Claude wrote a moved literal chunk with its punctuation outside the stars (`"*do*?"`). `literalChunks` accepts any starred
stretch in a chunk.

## Files

| File | What it holds |
|---|---|
| `public/js/practice/protocol.js` | The formats and checks, shared by the server and the app (pure; `scripts/test-practice.mjs`) |
| `src/practice.ts` | The room: practices and turns in its own SQLite, the waits, seats, presence, ceilings, cleanup alarm |
| `src/mcp-practice.ts` | The MCP tools and prompts |
| `src/practice-guide.ts` | `get_practice_guide`: how the AI runs a practice, grades and deals cards. The quality of a practice is this plus the person's AI |
| `src/app.ts` | `/api/practice/*` for the app; practices in the account export; `src/accounts.ts` wipes the room on delete |
| `public/js/practice/home.js` | The section (`#study/practice`, `new/<kind>`, `room[/<id>]`, `past/<id>`) |
| `public/js/practice/room.js` | The live room: the poll loop, sending turns, the microphone, status, the end |
| `public/js/practice/transcript.js` | Draws turns (live and past), the summary block |
| `public/js/practice/cards.js` | Cards: the app's own games with the AI's sentence, graded here, recorded as Study's games record |
| `public/js/practice/listen.js` | The microphone: free speech, or a sentence to say |
| `public/js/practice/store.js` | Practices on the device (IndexedDB `lexicommons-practice`), grades → evidence, collecting |
| `public/js/practice/learner.js` | The snapshot of what you know, for your AI |
| `public/js/practice/ui.js`, `public/css/lx/practice.css` | The Practice parts (`lx/parts.js`), shown on `/design` by `public/js/design-practice.js` |
| `public/js/practice/today.js` | Today's line |

## MCP

- `get_practice_guide`, `get_learner`, `practice_wait`, `practice_reply`, `practice_end`, `practice_log`,
  `list_practices`; prompts `practise` (the loop, in the app) and `practise_here` (in the AI's own app).
- A room error (a `PracticeError`) comes back from the Durable Object as `{ error }` (RPC loses error classes) and
  becomes a tool error with its message, so the AI can fix its call.
- Every `practice_wait` answer says what to do next (`next`).

## Evidence

- A grade's concepts become evidence rows in the usual format (`{ at, concept, skill, outcome, activity, item }`) with
  `activity: "practice:<kind>"`, `source: "ai"`, `client`, `how` (spoken or typed), `note`, `said`, `practice`. The
  skill is the concept's own (if the AI gave one), else speaking or writing from how you answered. `avoided` stays in
  the practice's record and is not evidence.
- The summary's concepts count too (the guide says: only what no turn graded).
- Cards record exactly what the same game records in Study, with `source: "ai"` and `practice`.
- For now AI grades count like a game's; the tags let the scheduling weigh each kind later.
- Each row is recorded once per device (the practice's `recorded` keys).

## Checks

```sh
node scripts/test-practice.mjs                      # the protocol and grades → evidence (exit 0 = pass)
# End to end on a LOCAL server (signs up and deletes a test account; needs whisper-small in public/models):
python3 pipelines/lyric-video/tools/gpu.py run --who <session> --label "practice check" --kind stills -- \
  node 08-lexicommons/app/scripts/practice-check.mjs http://localhost:<port> <outDir>
# Against a real AI: the scripted learner in Chrome, the AI in its own client with the token the script writes
python3 pipelines/lyric-video/tools/gpu.py run --who <session> --label "practice live" --kind stills -- \
  node 08-lexicommons/app/scripts/practice-live.mjs http://localhost:<port> <outDir> [--kind conversation]
LEX_TOKEN=$(cat <outDir>/token.txt) codex exec --skip-git-repo-check \
  -c 'mcp_servers.lexlocal.url="http://localhost:<port>/mcp"' -c 'mcp_servers.lexlocal.bearer_token_env_var="LEX_TOKEN"' \
  -c 'mcp_servers.lexlocal.default_tools_approval_mode="approve"' \
  "Practice Dutch with me in Lexicommons. I'm in the app. Read get_practice_guide once, then call practice_wait and keep the loop going exactly as the guide says, without writing to me here, until the practice ends. Then call practice_end with your summary."
```

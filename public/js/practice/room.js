// The practice room: a live practice with your AI, over the whole screen like a study session. Your AI isn't here:
// it's in your own AI app, waiting on Lexicommons for your turns (practice_wait) and sending its replies
// (practice_reply). This page long-polls the same practice, so its replies show the moment they're sent, and sends
// your turns, typed or said (recognized on this device), the same way. When it ends, the practice (transcript, grades,
// summary) is saved on this device and the server lets it go. It's in the practice's language (the one you were
// learning when it started): its lines, your answers and the microphone.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import * as motion from "../lx/motion.js";
import * as voice from "../study/voice.js";
import { getStudySettings } from "../study/settings.js";
import { learningName } from "../study/learning.js";
import { LANGUAGES, languageName } from "../lang/index.js";
import { api, keptMe, post, whoAmI } from "../shell/api.js";
import { keySummary, ownKeyPresent } from "../ai/own-key.js";
import { KINDS } from "./protocol.js";
import * as P from "./ui.js";
import { microphone, prepareSpeech } from "./listen.js";
import { createTranscript, summaryBlock } from "./transcript.js";
import { getPractice, languageOf, lastSeqOf, recordCard, savePractice } from "./store.js";
import { inappRunner } from "./inapp-run.js";

const PREFS = "lx.practice.v1";
/** This device's practice preferences: { readAloud, answer, minutes }. */
export function practicePrefs() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PREFS) ?? "{}") ?? {};
  } catch {}
  return { readAloud: getStudySettings().listening.cards, answer: "both", minutes: 10, ...saved };
}
export function setPracticePrefs(change) {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ ...practicePrefs(), ...change }));
  } catch {}
}

const SLOW = 60_000; // thinking this long: "taking a while"
const AWAY = 60_000; // not waiting this long: "isn't answering"
const SUMMARY_WAIT = 120_000; // after the end, how long to wait for your AI's summary

const waitPhrases = () => [
  { label: "In any AI app connected to Lexicommons", text: `Practice ${learningName()} with me in Lexicommons` },
  { label: "Or in Claude Code", text: "/mcp__lexicommons__practise", code: true },
];

/**
 * Opens the room for practice `id` over `host`. onClose() when you leave it (the practice carries on until it ends);
 * base: the section's address (Practice again starts a new one there). Returns { close() }.
 */
export function openRoom(host, id, { onClose, base = "#study/practice" } = {}) {
  const prefs = practicePrefs();
  let meta = null;
  let after = 0;
  let version = "";
  let clockSkew = 0; // server time minus this device's
  let closed = false;
  let ended = false;
  let endedAt = 0;
  let saved = false;
  let controller = null;
  let failures = 0;
  let readAloud = prefs.readAloud;
  let typing = null;
  let awayShown = false;
  // Every turn so far, for the in-app AI (inapp-run.js), which works from the whole practice; a practice your AI runs never uses it.
  const allTurns = [];
  const remember = (turns) => {
    for (const turn of turns) if (!allTurns.some((t) => t.seq === turn.seq)) allTurns.push(turn);
    allTurns.sort((a, b) => a.seq - b.seq);
  };
  const runner = inappRunner(id, {
    start: () => meta && update(meta),
    lines: (lines) => {
      transcript.draftLines(lines);
      if (typing) transcript.node.append(typing);
      if (nearBottom()) toBottom();
    },
    done: () => meta && update(meta),
    error: (text, retry, code) => {
      transcript.clearDraft();
      if (meta) update(meta);
      const line = P.eventLine(text, "info");
      if (code === "used_up") {
        // The plan's month is used: nothing changes until it turns, so no Try again. With a key of yours on this device, the
        // practice can carry on with it, on its own row under the words; otherwise End is the way on, and it's there already.
        if (keptMe()?.features?.ownKey && ownKeyPresent()) {
          const row = el("p", { part: "chat-event" });
          row.append(carryOnWithKey([line, row], retry));
          transcript.node.append(line, row);
          toBottom();
          return;
        }
      } else {
        line.append(
          ui.button("Try again", {
            variant: "fade",
            size: "sm",
            icon: "refresh",
            onclick: () => {
              line.remove();
              retry();
            },
          }),
        );
      }
      transcript.node.append(line);
      toBottom();
    },
  });
  /** "Carry on with your own key": the practice's engine switched to the key on this device, and asked again on it. */
  function carryOnWithKey([line, row], retry) {
    let switching = false;
    return ui.button("Carry on with your own key", {
      variant: "fade",
      size: "sm",
      icon: "key",
      onclick: async () => {
        if (switching) return;
        switching = true;
        try {
          const me = await whoAmI();
          const key = await keySummary(me.user.id);
          if (!key) throw new Error("There's no key on this device for this account any more. Add it again in the AI section.");
          const practice = await post(`/api/practice/${encodeURIComponent(id)}/engine`, { engine: "own-key", name: key.model.name });
          line.remove();
          row.remove();
          update(practice);
          retry(practice);
        } catch (error) {
          switching = false;
          row.replaceWith(P.eventLine(error.message, "info"));
        }
      },
    });
  }
  prepareSpeech();

  const status = P.aiStatus("absent");
  const readButton = ui.iconButton("speaker", "Read your AI's lines aloud", {
    onclick: () => {
      readAloud = !readAloud;
      setPracticePrefs({ readAloud });
      readButton.setAttribute("aria-pressed", String(readAloud));
      if (!readAloud) voice.stopSpeaking();
    },
  });
  readButton.setAttribute("aria-pressed", String(readAloud));
  const title = el("span", { class: "lx-room-title" }, "Practice with your AI");
  const bar = el("div", { part: "session-bar" }, ui.iconButton("cross", "Leave (the practice carries on)", { onclick: () => leave() }), el("div", { class: "lx-room-head" }, title, status), readButton);
  const transcript = createTranscript({
    practiceId: id,
    live: true,
    readAloud: () => readAloud,
    onCard: (seq, card, result) => {
      recordCard(id, seq, result.rows);
      send({ type: "card", card: seq, game: card.game, correct: result.correct, answer: result.answer, hint: result.hint, tries: result.tries });
    },
  });
  const waitPanel = P.aiWait(waitPhrases(), { note: "Not connected yet? Settings → Your AI shows how. Your AI has 30 minutes to join." });
  const activity = el("main", { part: "activity", class: "lx-room-chat" }, waitPanel, transcript.node);
  const answerBar = ui.answerBar();
  const root = el("div", { part: "session", class: "lx-practice-room", role: "dialog", "aria-label": "Practice with your AI" }, bar, activity, answerBar);
  host.append(root);
  document.documentElement.setAttribute("data-scroll-lock", "");

  // ---------- your turns ----------

  const composer = P.composer({
    answer: prefs.answer,
    onSend: (text) => send({ type: "said", text, how: "typed" }),
    onMic: () => mic.press(),
    onHint: () => send({ type: "hint" }),
    onEnd: () => endPractice(),
  });
  const mic = microphone({
    mic: composer.lxMic,
    status: composer.lxStatus,
    isCurrent: () => !closed && !ended,
    locale: () => LANGUAGES[transcript.state.language]?.locale ?? transcript.state.language,
    onResult: (result, choice) => {
      if (!result.heard?.trim()) return (composer.lxStatus.textContent = "Heard nothing clear. Press the microphone and speak.");
      send({ type: "said", text: result.heard.trim(), how: "spoken", engine: choice.engine, unsure: result.unsure ?? [] });
    },
    onError: (text) => (composer.lxStatus.textContent = text),
  });
  answerBar.firstElementChild.replaceChildren(composer);

  // The practice's language, once it arrives (before its turns are drawn).
  function useLanguage(practice) {
    const code = languageOf(practice);
    if (code === transcript.state.language) return;
    transcript.state.language = code;
    composer.lxSetLanguage(code, languageName(code));
  }

  const nearBottom = () => activity.scrollHeight - activity.scrollTop - activity.clientHeight < 160;
  const toBottom = () => activity.scrollTo({ top: activity.scrollHeight, behavior: motion.motionOn() ? "smooth" : "auto" });

  async function send(body) {
    if (ended) return;
    const key = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const line = body.type === "said" ? transcript.pendingLine(key, body.text, body.how) : null;
    toBottom();
    const attempt = async () => {
      try {
        const answer = await post(`/api/practice/${encodeURIComponent(id)}/turns`, { ...body, key });
        transcript.apply([answer.turn]);
        remember([answer.turn]);
        update(answer.practice);
      } catch (error) {
        if (!line) return (composer.lxStatus.textContent = error.message);
        line.setAttribute("data-state", "failed");
        const retry = ui.button("Couldn't send. Try again", {
          variant: "fade",
          size: "sm",
          icon: "refresh",
          onclick: () => {
            retry.remove();
            line.setAttribute("data-state", "sending");
            attempt();
          },
        });
        line.append(retry);
      }
    };
    await attempt();
  }

  // ---------- your AI ----------

  function statusOf(practice) {
    if (practice.state === "ended") return "ended";
    if (practice.mode === "ai") return "logging"; // your AI is logging it from its own app
    // The in-app AI's reply is made from this device (inapp-run.js): it's thinking only while it is. One that failed (the month's AI
    // used up, a provider down) is said in the transcript with Try again, never left as thinking.
    if (practice.mode === "inapp") return runner.running ? "thinking" : "here";
    const ai = practice.ai;
    const since = Date.now() + clockSkew - (ai.since ?? 0);
    if (ai.phase === "absent") return "absent";
    if (ai.phase === "thinking") return since > SLOW ? "slow" : "thinking";
    if (ai.phase === "away") return since > AWAY ? "away" : "here";
    return "here";
  }

  function update(practice) {
    meta = practice;
    useLanguage(practice);
    const kind = KINDS[practice.settings.kind];
    title.textContent = kind?.name ?? "Practice with your AI";
    root.setAttribute("aria-label", `Practice with your AI: ${title.textContent}`);
    transcript.state.client = practice.client ?? "Your AI";
    const now = statusOf(practice);
    status.lxSet(now, practice.client);
    waitPanel.hidden = practice.ai.phase !== "absent" || practice.state === "ended" || practice.mode === "ai";
    // A practice your AI logs from its own app (practice_log): this page follows it; you answer there, not here.
    if (practice.mode === "ai" && composer.isConnected) {
      composer.remove();
      answerBar.firstElementChild.replaceChildren(el("p", { class: "lx-small lx-muted" }, `${practice.client ?? "Your AI"} is logging this practice from its own app. It shows here as it goes.`));
    }
    // Thinking dots while your AI works on its reply.
    const thinking = now === "thinking" || now === "slow";
    if (thinking && !typing) {
      typing = P.typing(`${practice.client ?? "Your AI"} is thinking`);
      transcript.node.append(typing);
      motion.appear(typing);
      if (nearBottom()) toBottom();
    } else if (!thinking && typing) {
      typing.remove();
      typing = null;
    }
    if (now === "away" && !awayShown) {
      awayShown = true;
      transcript.node.append(P.eventLine(`${practice.client ?? "Your AI"} has stopped answering. In your AI, say “carry on with the Lexicommons practice”.`, "info"));
    } else if (now !== "away") awayShown = false;
    if (practice.state === "ended" && !ended) onEnded();
    // The in-app AI on this device's key: a reply, or the summary, when one is due.
    if (practice.mode === "inapp") {
      if (practice.state === "ended") runner.summarize(practice, allTurns);
      else runner.consider(practice, allTurns);
    }
  }

  // ---------- the live loop ----------

  async function loop() {
    while (!closed && !saved) {
      controller = new AbortController();
      try {
        const wait = version ? 25 : 0;
        const response = await fetch(`/api/practice/${encodeURIComponent(id)}?after=${after}&v=${encodeURIComponent(version)}&wait=${wait}`, { credentials: "same-origin", signal: controller.signal });
        if (response.status === 401) return location.assign(`/login?next=${encodeURIComponent("/app/" + location.hash)}`);
        if (response.status === 404) return gone();
        if (!response.ok) throw new Error(`poll ${response.status}`);
        const data = await response.json();
        failures = 0;
        root.removeAttribute("data-offline");
        clockSkew = data.now - Date.now();
        const first = !version;
        version = data.version;
        const keep = nearBottom();
        useLanguage(data.practice);
        if (data.turns.length) {
          after = Math.max(after, ...data.turns.map((t) => t.seq));
          remember(data.turns);
          // Anything arriving after the first load is new: it appears, and your AI's lines are read aloud. A turn that
          // can't be drawn is a bug, not a dropped connection: it's reported, and the rest still arrive.
          try {
            transcript.apply(data.turns, { arriving: !first });
          } catch (error) {
            console.error("[practice] couldn't draw a turn:", error);
          }
          if (typing && data.turns.some((t) => t.who === "ai")) {
            typing.remove();
            typing = null;
          }
          savePractice(data.practice, data.turns);
        }
        update(data.practice);
        if (first || keep) toBottom();
        if (ended && (transcript.summary || Date.now() - endedAt > SUMMARY_WAIT)) return finish();
      } catch (error) {
        if (closed || error.name === "AbortError") {
          if (closed) return;
          continue;
        }
        failures++;
        root.setAttribute("data-offline", "");
        status.lxSet("offline");
        await new Promise((resolve) => setTimeout(resolve, Math.min(15000, 1000 * 2 ** Math.min(failures, 4))));
      }
    }
  }

  // Time passing changes what the status says ("taking a while"), with nothing new from the server.
  const ticker = setInterval(() => meta && update(meta), 5000);
  // Coming back to the app: ask straight away rather than finishing a wait the phone may have frozen.
  const onVisible = () => document.visibilityState === "visible" && controller?.abort();
  document.addEventListener("visibilitychange", onVisible);

  // ---------- the end ----------

  async function endPractice() {
    if (ended) return;
    try {
      update(await post(`/api/practice/${encodeURIComponent(id)}/end`));
    } catch (error) {
      composer.lxStatus.textContent = error.message;
    }
  }

  function onEnded() {
    ended = true;
    endedAt = Date.now();
    mic.cancel();
    composer.remove();
    const waiting = meta.client && !transcript.summary ? el("p", { class: "lx-small lx-muted" }, `Waiting for ${meta.client}'s summary…`) : null;
    answerBar.firstElementChild.replaceChildren(
      ...(waiting ? [waiting] : []),
      el(
        "div",
        { class: "lx-answer-actions" },
        ui.button("Practice again", { variant: "gray", onclick: () => (location.hash = `${base}/new/${meta.settings.kind}`) }),
        ui.button("Done", { variant: "go", size: "lg", onclick: () => leave() }),
      ),
    );
    if (!meta.client) finish();
  }

  async function finish() {
    if (saved) return;
    saved = true;
    const full = await api(`/api/practice/${encodeURIComponent(id)}?after=0`).catch(() => null);
    const practice = full ? await savePractice(full.practice, full.turns) : await getPractice(id);
    if (full) await post(`/api/practice/${encodeURIComponent(id)}/collected`, { after: lastSeqOf(full.turns) }).catch(() => {});
    answerBar.querySelector(".lx-small")?.remove();
    if (practice) {
      const block = summaryBlock(practice);
      transcript.node.append(block);
      motion.appear(block);
      toBottom();
    }
  }

  async function gone() {
    // Collected by another device, or deleted: show what this device has.
    const practice = await getPractice(id);
    status.lxSet("ended");
    composer.remove();
    if (practice) {
      transcript.state.language = languageOf(practice);
      transcript.apply(practice.turns);
      transcript.closeCards();
      transcript.node.append(summaryBlock(practice));
    } else transcript.node.append(P.eventLine("This practice isn't here any more.", "info"));
    answerBar.firstElementChild.replaceChildren(ui.button("Done", { variant: "go", size: "lg", block: true, onclick: () => leave() }));
  }

  function leave() {
    close();
    onClose?.();
  }

  function close() {
    if (closed) return;
    closed = true;
    controller?.abort();
    runner.stop();
    clearInterval(ticker);
    document.removeEventListener("visibilitychange", onVisible);
    mic.cancel();
    voice.stopSpeaking();
    root.remove();
    if (!document.querySelector('[data-part="session"]:not([data-ghost])')) document.documentElement.removeAttribute("data-scroll-lock");
  }

  loop();
  return { close, element: root };
}

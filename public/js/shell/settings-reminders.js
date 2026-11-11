// Settings → Reminders (#settings/reminders): turning reminders on for this device (from a tap: the system's prompt, then
// push.js subscribes), each kind's switch (the daily reminder, your AI finished something, community, the week), the
// reminder's time and the moment in your day it's tied to, quiet hours, a test, and off. On an iPhone or iPad browser
// tab it shows the way to the Home Screen app instead, where reminders work. Rules: src/reminders.ts.
// The ask after a first finished session (reminderStep) lives here too: a step of its own after the summary, shown once.

import * as ui from "../lx/ui.js";
import { aiConnected } from "./layout.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { api } from "./api.js";
import { answeredAsk, askedAboutReminders, pushSupport, serverCanSend, serverSendsKnown, startTime, turnOff, turnOn } from "../push.js";
import { deviceTag } from "../sync.js";
import { drawnEmpty, wordsRow } from "./settings.js";

// A reminder card's head: Tinta idle in the top corner, and its words beside and under him (never over him: he floats, so a
// line that's past him runs the card's width, which keeps the card short on a small phone). Its clock pose, and a sleepy one
// while reminders are paused, come as lex-character's part states `clock` and `sleepy`.
const cardHead = (...words) => el("div", { class: "lx-ask-head" }, ui.character({ size: 56, hidden: true }), el("div", { class: "lx-ask-text" }, ...words));

const put = (path, body) => api(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const WHY = {
  denied: "Notifications are off for Lexicommons on this device. Turn them on in your device's settings, then come back.",
  home: "On iPhone and iPad, reminders come to Lexicommons on your Home Screen.",
  unsupported: "This browser can't show reminders.",
  server: "Reminders aren't set up on this server yet.",
};

/** A time field (16px: an iPhone zooms in on smaller ones). */
const timeField = (label, value) => el("input", { part: "text-field", type: "time", value, "aria-label": label, step: 300 });

export function remindersSettings(page, params = {}) {
  let alive = true;
  const msg = el("p", { part: "group-note", role: "status" });
  // The one status line, shared: a save's "Saved." never replaces what was said after that change was made (Send a test's answer,
  // turning off). A save answered late wrote "Saved." over "Sent. It should arrive in a moment." (7 Nov 2026, push-check 1 run in 6).
  let told = 0;
  const say = (text) => {
    told += 1;
    msg.textContent = text;
  };
  const back = params.from === "today" ? { href: "#today", label: "Home" } : undefined;
  const title = ui.pageTitle("Reminders");
  const body = el("div", { class: "lx-settings-body" }, ui.skeleton({ height: 180 }));
  page.replaceChildren(title, body, msg);

  const draw = async () => {
    const support = pushSupport();
    // A server that can't send (a copy run without push keys): nothing to turn on here, and nothing asked of the phone. (Not known, as
    // offline: as before; Turn on asks again before the phone.)
    const sends = support.on ? true : await serverCanSend().catch(() => true);
    if (!alive) return;
    if (!sends) {
      body.replaceChildren(ui.emptyState(WHY.server, { pose: "shrug" }));
      return;
    }
    if (!support.can || support.permission === "denied") {
      const why = support.needsHomeScreen ? "home" : support.permission === "denied" ? "denied" : "unsupported";
      // Where reminders can't come: Tinta shrugs; on an iPhone or iPad browser tab it points at the way to the Home Screen.
      const way = why === "home" ? ui.group(null, [ui.listRow({ title: "Add Lexicommons to your Home Screen", href: "#settings/install" })]) : null;
      const empty = ui.emptyState(WHY[why], { pose: way ? "idle" : "shrug" });
      body.replaceChildren(...[empty, way].filter(Boolean));
      if (way) requestAnimationFrame(() => ui.pointCharacter(empty.querySelector('[data-part="character"]'), [way]));
      return;
    }
    if (!support.on) {
      body.replaceChildren(
        ui.emptyState("One a day at most, at your time, and only on a day you haven't studied. Never a warning.", { pose: "idle" }),
        ui.button("Turn on reminders", {
          variant: "go",
          block: true,
          onclick: async () => {
            say("");
            try {
              const result = await turnOn();
              if (!result.ok) return say(WHY[result.why] ?? result.why);
              draw();
            } catch (error) {
              say(error.message);
            }
          },
        }),
      );
      return;
    }
    let state;
    try {
      state = await api("/api/reminders");
    } catch (error) {
      body.replaceChildren(drawnEmpty("empty-offline", error.message, "off"));
      return;
    }
    if (!alive) return;
    if (!state.on) {
      // The server lost this device (it was turned off elsewhere): on again from here.
      await turnOff();
      return draw();
    }
    const s = state.settings;
    // One save at a time, in order, each with the settings as they are when it goes: a slow one never arrives after a
    // later change and brings back what it replaced.
    let saving = Promise.resolve();
    const save = (changes) => {
      Object.assign(s, changes);
      const since = told;
      saving = saving.then(async () => {
        try {
          await put("/api/reminders/settings", s);
          if (told === since) msg.textContent = "Saved.";
        } catch (error) {
          msg.textContent = error.message;
        }
      });
      return saving;
    };
    const time = timeField("Reminder time", s.time);
    time.addEventListener("change", () => time.value && save({ time: time.value }));
    const cue = el("input", { part: "text-field", type: "text", value: s.cue, maxlength: 40, placeholder: "After dinner", "aria-label": "When in your day", autocomplete: "off" });
    cue.addEventListener("change", () => save({ cue: cue.value.trim() }));
    const from = timeField("Quiet from", s.quietFrom);
    const to = timeField("Quiet until", s.quietTo);
    from.addEventListener("change", () => from.value && save({ quietFrom: from.value }));
    to.addEventListener("change", () => to.value && save({ quietTo: to.value }));
    body.replaceChildren(
      ...(state.stopped
        ? [
            el(
              "div",
              { part: "reminder-ask", state: "paused" },
              cardHead(el("p", {}, "Reminders are paused because the last few went unanswered.")),
              ui.button("Turn them back on", { onclick: async () => (await save({}), draw()) }),
            ),
          ]
        : []),
      ui.group(null, [
        ui.switchRow({ title: "Remind me to study", checked: s.daily, onchange: (on) => save({ daily: on }) }),
        el("li", { class: "lx-row-item lx-reminder-fields" }, el("label", { part: "field" }, "At", time), el("label", { part: "field" }, "When in your day", cue)),
      ]),
      ui.namedGroup(
        "Also tell me",
        [
          aiConnected() ? ui.switchRow({ title: "When your AI finishes something", checked: s.ai, onchange: (on) => save({ ai: on }) }) : null,
          ui.switchRow({ title: "Community", sub: "A correction to your pack, your request answered", checked: s.community, onchange: (on) => save({ community: on }) }),
          ui.switchRow({ title: "The week", sub: "Sunday evening, in one line", checked: s.week, onchange: (on) => save({ week: on }) }),
        ],
      ),
      ui.namedGroup(
        "Quiet hours",
        [el("li", { class: "lx-row-item lx-reminder-fields" }, el("label", { part: "field" }, "From", from), el("label", { part: "field" }, "Until", to))],
      ),
      ui.group(null, [
        ui.listRow({
          title: "Send a test",
          trailing: el("span"),
          onclick: async () => {
            try {
              const r = await post("/api/push/test", { device: deviceTag() });
              say(r.ok ? "Sent. It should arrive in a moment." : "It didn't go through. Turn reminders off and on again on this device.");
            } catch (error) {
              say(error.message);
            }
          },
        }),
        wordsRow(
          "How reminders work",
          "At most one study reminder and two notifications a day. Only on a day you haven't studied yet, never in a pause, and never twice.",
          "Tie it to a moment in your day, like after dinner: habits grow from moments more than from clocks.",
          "Nothing arrives in quiet hours. A study reminder that would is skipped; anything else waits until they end.",
        ),
        ui.listRow({
          title: "Turn off reminders on this device",
          trailing: el("span"),
          onclick: async () => {
            await turnOff();
            say("Reminders are off on this device.");
            draw();
          },
        }),
      ]),
    );
  };
  draw();
  return { title: "Reminders", back, dispose: () => (alive = false) };
}

/** At a summary, ahead of its Done: whether the server can send, so the ask (reminderStep) knows before it's drawn. Only while it could come. */
export function beforeReminderStep() {
  if (askedAboutReminders() || pushSupport().on) return;
  serverCanSend().catch(() => {});
}

/**
 * A second tap this soon after Done's, and this near it, is Done's double tap (reminderStep's forward button). iOS 26.4 Safari delivers both
 * clicks of a double tap at one spot, touch-action: manipulation or not: up to 383 ms apart on its Simulator (7 Nov 2026), and 250 ms in the
 * real flow, where the second opened Show me how.
 */
export const DOUBLE_TAP = { ms: 450, px: 44 };

/**
 * The ask after a first finished session: a step of its own after the summary's Done (study/session.js finish), the title and its
 * line beside Tinta, its buttons in the session's bar. Shown once: answered the moment it's shown, so whatever's pressed next (or
 * nothing, the session closed) it never comes back; Settings → Reminders is the way after. On a browser that can: a time and Turn
 * on (the system's prompt comes from that tap). On an iPhone or iPad browser tab: the way to the Home Screen app. null when it
 * shouldn't show. bar(...buttons) puts the step's buttons in the bar; done() ends the session; from: Done's press ({ x, y, at }), for
 * the double-tap guard (forward). { node, buttons, notNow }.
 */
export function reminderStep({ bar, done, from = null }) {
  const support = pushSupport();
  if (askedAboutReminders() || support.on || (!support.can && !support.needsHomeScreen) || support.permission === "denied") return null;
  // A server known to be unable to send (a copy run without push keys): no ask. Not known yet, it asks, and Turn on asks the server first.
  if (serverSendsKnown() === false) return null;
  answeredAsk();
  const title = el("h2", {}, "Want a reminder?");
  const line = el("p", {}, support.needsHomeScreen ? "On iPhone and iPad, reminders come to Lexicommons on your Home Screen." : "One a day at most, only on a day you haven't studied yet.");
  const head = el("div", { class: "lx-remind-head" }, title, line, ui.character({ size: 72, hidden: true }));
  const notNow = ui.button("Not now", { variant: "gray", size: "lg", onclick: () => done() });
  // The step's forward button sits where Done was. In a double tap on Done, the second tap lands on it a beat later: that's Done's, never a
  // press here (Turn on would set off the phone's prompt, and one dismissed by reflex can block reminders for good). So it lets a press go
  // by that came down within DOUBLE_TAP.ms of Done's and DOUBLE_TAP.px of where Done's did; anywhere else on it, or any later, it takes
  // at once, and Not now always does. (The app's own rule for every double tap, lx/motion.js, is narrower: 200 ms and 24 px.)
  const forward = (text, iconName, act) => {
    let down = null;
    const button = ui.button(text, {
      variant: "white",
      size: "lg",
      icon: iconName,
      onclick: (event) => {
        const press = down;
        down = null;
        if (from && press && press.at - from.at < DOUBLE_TAP.ms && Math.hypot(press.x - from.x, press.y - from.y) < DOUBLE_TAP.px) return;
        act(event);
      },
    });
    button.addEventListener("pointerdown", (event) => (down = { x: event.clientX, y: event.clientY, at: performance.now() }), true);
    return button;
  };
  if (support.needsHomeScreen) {
    const show = forward("Show me how", "plus-square", () => (location.hash = "#settings/install"));
    return { node: el("section", { part: "reminder-step" }, head), buttons: [notNow, show], notNow: () => done() };
  }
  // The hour of the first session (push.js startTime), so a big day's new learners aren't all due at one 7 pm.
  const shown = startTime();
  const time = timeField("Reminder time", shown);
  const field = el("label", { part: "field" }, "At", time);
  const status = el("p", { class: "lx-ask-status", role: "status" });
  const yes = forward("Turn on", "clock", async () => {
    status.textContent = "";
    try {
      const result = await turnOn(time.value || shown);
      if (!result.ok) {
        status.textContent = WHY[result.why] ?? result.why;
        return;
      }
      // An account with reminders on another device kept its own time: one changed here goes on it.
      if (time.value && time.value !== shown) await put("/api/reminders/settings", { ...(await api("/api/reminders")).settings, time: time.value });
      // On: the step says so where it asked (the time's row holding its place), and Done goes on.
      title.textContent = "Reminders are on";
      line.textContent = `At ${time.value}. Change them in Settings → Reminders.`;
      field.style.visibility = "hidden";
      bar(ui.button("Done", { variant: "white", size: "lg", onclick: () => done() }));
    } catch (error) {
      status.textContent = error.message;
    }
  });
  return { node: el("section", { part: "reminder-step" }, head, field, status), buttons: [notNow, yes], notNow: () => done() };
}

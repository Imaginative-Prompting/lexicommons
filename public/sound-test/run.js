// A temporary page (public/sound-test/, an admin's row in Settings → About): which of the app's sounds an iPhone plays with its
// silent switch on, in the Home Screen app, and which stop other apps' music. Each test plays from its own press, the page's
// audio session back to "auto" and nothing else playing before it. Each answer goes to /api/notes on this account, as
// "sound-test <run> <test> heard=… music=… …", so whoever reads the notes has the results. It names navigator.audioSession
// itself, on purpose: it measures the types the app doesn't use (scripts/test-audio-session.mjs leaves this page out). It comes
// out once it has answered.

const SENTENCE = "/audio/starter-word-order/emma/morgen-oma.mp3";
const SILENCE = "/audio/silence.mp3";
const TEXT = "Morgen gaan we naar oma.";
const RUN = Math.random().toString(36).slice(2, 8);
const synth = globalThis.speechSynthesis ?? null;

const session = () => navigator.audioSession ?? null;
const typeNow = () => session()?.type ?? "none";
function setType(type) {
  try {
    if (session()) session().type = type;
  } catch {}
}

let media = null;
let underneath = null;
function stopAll() {
  media?.pause();
  underneath?.pause();
  underneath = null;
  synth?.cancel();
}

/** Plays the sentence's recording on a media element, as voice.js does. Resolves when it ends (or after 6 s). */
function playClip() {
  media ??= Object.assign(new Audio(), { preload: "auto" });
  media.src = SENTENCE;
  media.currentTime = 0;
  return new Promise((resolve) => {
    const done = () => resolve();
    media.onended = done;
    media.onerror = done;
    media.play().catch(done);
    setTimeout(done, 6000);
  });
}

function dutchVoice() {
  const voices = synth?.getVoices() ?? [];
  return voices.find((v) => /^nl[-_]NL/i.test(v.lang)) ?? voices.find((v) => /^nl\b/i.test(v.lang)) ?? null;
}

/** The phone's own voice reading the sentence, as voice.js's device voice does. Resolves when it ends (or after 6 s). */
function speak() {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    const u = new SpeechSynthesisUtterance(TEXT);
    const voice = dutchVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else u.lang = "nl-NL";
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
    setTimeout(resolve, 6000);
  });
}

let context = null;
/** Two soft notes made with Web Audio, as the celebration's chime makes them. Resolves once they've rung. */
function chimeNotes() {
  try {
    context ??= new AudioContext();
    if (context.state !== "running") context.resume().catch(() => {});
    const now = context.currentTime + 0.02;
    const out = context.createGain();
    out.gain.value = 0.2;
    out.connect(context.destination);
    for (const [hz, at] of [[659.25, 0], [987.77, 0.11]]) {
      const osc = context.createOscillator();
      const env = context.createGain();
      osc.frequency.value = hz;
      env.gain.setValueAtTime(0, now + at);
      env.gain.linearRampToValueAtTime(1, now + at + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, now + at + 0.45);
      osc.connect(env).connect(out);
      osc.start(now + at);
      osc.stop(now + at + 0.5);
    }
  } catch {}
  return new Promise((r) => setTimeout(r, 700));
}

// iOS lets a page start sound only inside a press, and once an element (or the voice) has played in one it may play later
// without: the first press unlocks both, so a test that plays its recording after the chime isn't refused for that.
let unlocked = false;
function unlockOnce() {
  if (unlocked) return;
  unlocked = true;
  media ??= Object.assign(new Audio(), { preload: "auto" });
  media.src = SILENCE;
  media.play().then(() => media.pause()).catch(() => {});
  try {
    synth?.speak(new SpeechSynthesisUtterance(""));
  } catch {}
}

const TESTS = [
  { id: "recording", title: "A recording", about: "A sentence read by a recorded voice, as lessons play it.", play: playClip },
  { id: "voice", title: "The phone's own voice", about: "What reads every line that has no recording.", play: speak },
  { id: "voice-playback", title: "The phone's voice, page set to “playback”", about: "The same voice, with the page asking to play like media.", play: () => (setType("playback"), speak()) },
  { id: "voice-transient", title: "The phone's voice, page set to “transient”", about: "The same voice, with the page asking to play over other audio.", play: () => (setType("transient"), speak()) },
  {
    id: "voice-under-media",
    title: "The phone's voice while a silent recording plays",
    about: "The same voice, with a recording of silence playing under it.",
    play: async () => {
      underneath = Object.assign(new Audio(SILENCE), { loop: true });
      await underneath.play().catch(() => {});
      await speak();
    },
  },
  { id: "effect", title: "A sound effect", about: "Two soft notes the app makes itself, as the celebration's chime does.", play: chimeNotes },
  {
    id: "chime-then-recording-old",
    title: "The celebration's chime, then a recording, as the app did until now",
    about: "The chime used to switch the page to “ambient” and leave it there.",
    play: async () => {
      setType("ambient");
      await chimeNotes();
      await playClip();
    },
  },
  {
    id: "chime-then-recording-new",
    title: "The celebration's chime, then a recording, as it does now",
    about: "The same, with nothing switched.",
    play: async () => {
      await chimeNotes();
      await playClip();
    },
  },
];

const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ios = (navigator.userAgent.match(/OS (\d+)_(\d+)/) ?? []).slice(1).join(".") || "?";
const answers = {};
let sending = Promise.resolve();

function send(test, played) {
  const a = answers[test.id] ?? {};
  const text = `sound-test ${RUN} ${test.id} heard=${a.heard ?? "-"} music=${a.music ?? "-"} type=${played?.during ?? "-"} after=${played?.after ?? "-"} standalone=${standalone} ios=${ios} api=${session() ? "yes" : "no"} voice=${played?.voice ?? "-"}`;
  const status = document.getElementById("sent");
  sending = sending.then(async () => {
    try {
      const response = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      status.textContent = response.ok ? "Saved. Thank you." : `Not saved (${response.status}). Are you signed in?`;
    } catch {
      status.textContent = "Not saved: no connection.";
    }
  });
}

function choice(label, onpick, group) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => {
    for (const other of group) other.setAttribute("aria-pressed", String(other === b));
    onpick();
  });
  group.push(b);
  return b;
}

const list = document.getElementById("tests");
const music = document.getElementById("music");
for (const test of TESTS) {
  const li = document.createElement("li");
  const title = document.createElement("p");
  title.append(Object.assign(document.createElement("strong"), { textContent: test.title }));
  const about = Object.assign(document.createElement("p"), { textContent: test.about });
  const play = Object.assign(document.createElement("button"), { type: "button", textContent: "Play" });
  const heardRow = Object.assign(document.createElement("div"), { className: "row", hidden: true });
  const musicRow = Object.assign(document.createElement("div"), { className: "row", hidden: true });
  let played = null;
  const heard = [];
  heardRow.append(
    choice("Heard it", () => ((answers[test.id] = { ...answers[test.id], heard: "yes" }), send(test, played)), heard),
    choice("Didn't hear it", () => ((answers[test.id] = { ...answers[test.id], heard: "no" }), send(test, played)), heard),
  );
  const kept = [];
  musicRow.append(
    choice("Music kept playing", () => ((answers[test.id] = { ...answers[test.id], music: "kept" }), send(test, played)), kept),
    choice("Music stopped or went quiet", () => ((answers[test.id] = { ...answers[test.id], music: "stopped" }), send(test, played)), kept),
  );
  play.addEventListener("click", async () => {
    unlockOnce();
    stopAll();
    setType("auto");
    play.disabled = true;
    play.textContent = "Playing…";
    const voice = dutchVoice()?.name ?? "default";
    const run = test.play();
    const during = typeNow();
    await run;
    played = { during, after: typeNow(), voice };
    stopAll();
    setType("auto");
    play.disabled = false;
    play.textContent = "Play again";
    heardRow.hidden = false;
    musicRow.hidden = !music.checked;
  });
  music.addEventListener("change", () => {
    if (played) musicRow.hidden = !music.checked;
  });
  li.append(title, about, play, heardRow, musicRow);
  list.append(li);
}
// iOS fills its voice list a moment after the page loads.
synth?.getVoices();

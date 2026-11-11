// The sound effects kit, as data (pure: no Web Audio, no DOM; scripts/test-sound.mjs loads it in Node). Each role is a
// moment that earns a sound, with its files under /audio/fx/ (public/audio/fx/LICENSES.md says where each came from).
// Every file is in one key and already leveled against the others (../docs/design/sound/research.md): the app plays
// them as they are.

export const FX_DIR = "/audio/fx";

/** Whether the kit's files are in the app. Until the kit is chosen, nothing is fetched and nothing plays ("no-kit"). */
export const KIT_READY = true;

/**
 * role → { files, about, pick }:
 *   files  the role's files, in order (none: the kit leaves that moment silent on purpose)
 *   pick   how a file is chosen: "one" (the only one), "turns" (they take turns: a tile's two), "step" (by the
 *          caller's step, from 1, the last one past the end: Match climbing pair by pair)
 */
export const ROLES = Object.freeze({
  right: { about: "A right answer", pick: "one", files: ["right.mp3"] },
  wrong: { about: "A wrong answer", pick: "one", files: ["wrong.mp3"] },
  "tile-in": { about: "A tile placed in the answer", pick: "turns", files: ["tile-in-1.mp3", "tile-in-2.mp3"] },
  "tile-out": { about: "A tile tapped back out", pick: "turns", files: ["tile-out-1.mp3", "tile-out-2.mp3"] },
  match: { about: "Match: a pair joined, one step higher each time", pick: "step", files: ["match-1.mp3", "match-2.mp3", "match-3.mp3", "match-4.mp3", "match-5.mp3", "match-6.mp3", "match-7.mp3", "match-8.mp3"] },
  "match-last": { about: "Match: the last pair", pick: "one", files: ["match-last.mp3"] },
  "match-miss": { about: "Match: a pair that doesn't", pick: "one", files: ["match-miss.mp3"] },
  "session-done": { about: "A session finished", pick: "one", files: ["session-done.mp3"] },
  "day-counted": { about: "Today counted", pick: "one", files: ["day-counted.mp3"] },
  "unit-done": { about: "The unit's gold stop, and a milestone", pick: "one", files: ["unit-done.mp3"] },
  "path-press": { about: "A press on a path stop", pick: "one", files: ["path-press.mp3"] },
  "tinta-hop": { about: "Tinta's hop, where it acts alone", pick: "one", files: ["tinta-hop.mp3"] },
});

/** Every file of the kit, once, as its address. */
export const kitFiles = () => [...new Set(Object.values(ROLES).flatMap((role) => role.files))].map((file) => `${FX_DIR}/${file}`);

/** The file a role plays now: by its pick, the caller's step, and how many times it has played (turns). */
export function fileFor(role, { step = 1, count = 0 } = {}) {
  const r = ROLES[role];
  if (!r || !r.files.length) return null;
  if (r.pick === "turns") return r.files[count % r.files.length];
  if (r.pick === "step") return r.files[Math.min(Math.max(1, Math.floor(step) || 1), r.files.length) - 1];
  return r.files[0];
}

// How much quieter an effect plays while words are said, and how fast it gets there and back (agreed with the games, 5 Nov
// 2026): down within about 60 ms of words starting, back up over about 200 ms after they end.
export const DUCK = 0.3;
export const DUCK_DOWN_S = 0.06;
export const DUCK_UP_S = 0.2;

/**
 * Where a decoded sound starts and when it has passed, from its samples (one channel, any rate): start, the first sample
 * within 50 dB of its peak less 1 ms (a decoder's padding never delays it); clear, when its 10 ms level has fallen 12 dB
 * under its loudest 10 ms, after that peak (what speech after an answer waits for). Seconds, from start.
 */
export function shapeOf(samples, rate) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (!peak) return { start: 0, clear: 0, length: 0 };
  const floor = peak * 10 ** (-50 / 20);
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < floor) first++;
  const start = Math.max(0, first - Math.round(rate * 0.001));
  const hop = Math.max(1, Math.round(rate * 0.01));
  const levels = [];
  for (let i = start; i < samples.length; i += hop) {
    let sum = 0;
    const end = Math.min(samples.length, i + hop);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    levels.push(Math.sqrt(sum / (end - i)));
  }
  let loudest = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[loudest]) loudest = i;
  const under = levels[loudest] * 10 ** (-12 / 20);
  let passed = levels.length;
  for (let i = loudest; i < levels.length; i++) {
    if (levels[i] < under) {
      passed = i;
      break;
    }
  }
  return { start: start / rate, clear: (passed * hop) / rate, length: (samples.length - start) / rate };
}

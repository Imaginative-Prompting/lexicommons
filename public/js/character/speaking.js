// What's being said right now, for Tinta's mouth (the speech drivers: docs/design-system.md, "Tinta speaks").
// study/voice.js announces every sound it plays here: a recording with its words' times (the manifest's), or a device
// voice with its words' times estimated and put right at each word boundary the voice reports. The character part
// (character.js) listens, and a Tinta that speaks moves its mouth with it. Nothing here plays anything or waits for
// anything, and it imports nothing, so voice.js stays as light as it was.

const listeners = new Set();
let current = null;

/** fn(speech) whenever a sound starts saying words, fn(null) when it stops; called at once with what's said now. */
export function onSpeech(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

/** What's being said now (see startSpeech), or null. */
export const currentSpeech = () => current;

const tell = () => {
  for (const fn of listeners) {
    try {
      fn(current);
    } catch (error) {
      console.error(error);
    }
  }
};

/**
 * A sound starts saying words. speech:
 *   kind   "recording" or "device"
 *   lang   the language it's in (its letters become mouth shapes by that language's writing)
 *   words  [{ text, start, end }]: what's said (a reading, where the language shows one) and when, in seconds on the
 *          sound's own clock
 *   clock  () → seconds into it now, on that clock
 *   src    a recording's address (its loudness is read from the file), or null; never a blob: address
 *   bytes  a kept recording's Blob (its loudness is read from it), or null
 * Returns end(), for when the sound stops or ends. One sound at a time, as voice.js plays them: a new one replaces it.
 */
export function startSpeech(speech) {
  current = speech;
  tell();
  return () => {
    if (current !== speech) return;
    current = null;
    tell();
  };
}

/**
 * A device voice's clock: its words' estimated times (rig kit/speech.js estimateWords), put right by the word
 * boundaries the voice reports. It runs on the estimate from start(t), so a voice that reports none still moves the
 * mouth. After a boundary it runs from that word's start and waits at that word's end (the mouth closes) until the
 * next one. Times t are in seconds (performance.now() / 1000).
 */
export function boundaryClock(words, t0) {
  let from = t0;
  let at = 0;
  let hold = Infinity;
  return {
    start(t) {
      from = t;
      at = 0;
      hold = Infinity;
    },
    reach(i, t) {
      const word = words[i];
      if (!word) return;
      from = t;
      at = word.start;
      hold = word.end;
    },
    at: (t) => Math.max(0, Math.min(at + (t - from), hold)),
  };
}

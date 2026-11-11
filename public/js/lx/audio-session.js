// The one place that sets the page's audio session (Safari's Audio Session API, navigator.audioSession: Safari 16.4 and
// later, iOS 17 and later). Its type belongs to the whole page, so whatever sets it decides for every sound after it.
// On 5 Nov 2026 the celebration's chime set "ambient" and left it there: on an iPhone with the silent switch on, every
// recording after the first finished lesson then played nothing.
//
// What each kind of sound does:
//   - speech (a pack's recordings on an <audio> element, the device's voice) is what the learner asked to hear. It plays
//     as media plays: under "auto", a playing media element makes the page "playback" (through the silent switch).
//   - effects (lx/sound.js) are Web Audio, which "auto" already plays as "ambient": they follow the silent switch and mix
//     with other apps' music. Nothing needs setting for them.
//   - the microphone records and plays together while it's open ("play-and-record"), then the page goes back to "auto".
// So the type is "auto" except while the microphone is open. Nothing else in the app sets it: scripts/test-audio-
// session.mjs fails on any other file that does, and audio-session-check.mjs plays a celebration and then a sentence
// with the session watched.

const TYPES = {
  // The microphone is open: record and play together.
  microphone: "play-and-record",
  // Anything else: the browser decides from what's playing (speech through the switch, effects with it).
  idle: "auto",
};

/** Sets the page's audio session for what's happening now: "microphone" while it's open, "idle" otherwise. */
export function audioSessionFor(use) {
  const type = TYPES[use];
  if (!type) throw new Error(`No audio session for "${use}"`);
  try {
    if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type;
  } catch {
    // Not settable here: the browser's own choice stands.
  }
}

/** The type each use sets (for tests). */
export const AUDIO_SESSION_TYPES = Object.freeze({ ...TYPES });

// The page's side of reading an Anki file: a worker that does the reading, ended outright when it goes quiet for too long
// or runs past its time, so nothing in a file can hold the page. The worker and the parser load only when someone
// picks a file; none of it is in the app's shell.

import { DeckError } from "./zip.js";
import { sha256Hex } from "../storage.js";
import { keepClip } from "../study/clips.js";

export const QUIET_MS = 45_000; // no word from the worker for this long ends it
export const WHOLE_MS = 300_000; // nor does it read for longer than this
const SOUNDS_MS = 600_000; // its sounds, at most

/** Reads a file. Resolves to { deck, keepSounds(wanted, onProgress), close() }, or rejects with a DeckError's words. */
export function readDeckFile(file, { onProgress = () => {}, quietMs = QUIET_MS, wholeMs = WHOLE_MS } = {}) {
  const worker = new Worker("/js/anki/worker.js");
  let quiet = 0;
  let whole = 0;
  let failed = null;
  const stopTimers = () => {
    clearTimeout(quiet);
    clearTimeout(whole);
  };
  const close = () => {
    stopTimers();
    worker.terminate();
  };
  const tooLong = () => new DeckError("too-slow", "This deck took too long to read on this device, so it was stopped and nothing was added.");
  const armed = (fail, quietFor = quietMs) => {
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      close();
      fail(tooLong());
    }, quietFor);
  };

  const opened = new Promise((resolve, reject) => {
    failed = reject;
    whole = setTimeout(() => {
      close();
      reject(tooLong());
    }, wholeMs);
    armed(reject);
    worker.onerror = (event) => {
      event.preventDefault?.();
      close();
      reject(new DeckError("broken", "This file couldn't be read on this device, so nothing was added."));
    };
    worker.onmessage = ({ data }) => {
      armed(reject);
      if (data.progress) onProgress(data.progress);
      else if (data.error) {
        close();
        reject(new DeckError(data.error.code, data.error.message));
      } else if (data.deck) {
        stopTimers();
        resolve({ deck: data.deck, keepSounds, close });
      }
    };
    worker.postMessage({ open: file });
  });

  // Each card's sound, kept on this device under a name from its bytes. Resolves to { clips: { card: clip }, kept, skipped, stopped }.
  function keepSounds(wanted, onSounds = () => {}) {
    return new Promise((resolve) => {
      const clips = {};
      const finish = (counts) => {
        stopTimers();
        resolve({ clips, ...counts });
      };
      const giveUp = () => finish({ kept: Object.keys(clips).length, skipped: 0, stopped: wanted.length - Object.keys(clips).length });
      whole = setTimeout(() => {
        worker.terminate();
        giveUp();
      }, SOUNDS_MS);
      armed(giveUp);
      worker.onerror = () => giveUp();
      worker.onmessage = async ({ data }) => {
        armed(giveUp);
        if (data.progress) onSounds(data.progress);
        else if (data.sound) {
          const { card, kind, bytes } = data.sound;
          const hash = (await sha256Hex(new Uint8Array(bytes))).slice(0, 16);
          const clip = `${hash}.${kind}`;
          const ok = await keepClip(clip, new Blob([bytes], { type: kind === "mp3" ? "audio/mpeg" : "audio/mp4" }));
          if (ok) clips[card] = clip;
          worker.postMessage({ kept: Boolean(ok) });
        } else if (data.soundsDone) finish(data.soundsDone);
        else if (data.error) giveUp();
      };
      worker.postMessage({ sounds: wanted });
    });
  }

  return opened.finally(() => {
    failed = null;
  });
}

// Every way listening can fail, as one error type with a code for the game and a sentence for people.

const MESSAGES = {
  denied: "Lexicommons isn't allowed to use the microphone. Allow it in your browser's settings for this site, then try again.",
  "no-mic": "No microphone was found on this device.",
  busy: "The microphone is being used by another app. Close it and try again.",
  "no-speech": "Didn't hear anything. Try again, a little closer to the microphone.",
  deaf: "Didn't hear anything. If you were speaking, the browser's recognizer may have stopped hearing: close the app and open it again to bring it back.",
  unsupported: "This browser can't recognize speech.",
  network: "The browser's recognizer needs an internet connection, and couldn't reach it.",
  "model-missing": "The speech model isn't on this device yet. Download it in Settings, Study.",
  "model-failed": "The speech model couldn't run on this device.",
  storage: "This browser can't keep the speech model on the device.",
  space: "There isn't enough room on this device for the speech model.",
  offline: "Can't reach the site to download the speech model. Check your connection.",
  "download-failed": "The download didn't finish. Try again; what's done so far is kept.",
  aborted: "Stopped listening.",
  failed: "Something went wrong while listening. Try again.",
};

export class SpeechError extends Error {
  constructor(code, message = MESSAGES[code] ?? MESSAGES.failed, { cause } = {}) {
    super(message, { cause });
    this.name = "SpeechError";
    this.code = code;
  }
}

/** Any thrown thing as a SpeechError, keeping a code it already has (a StoreError's, say). */
export function asSpeechError(error, fallback = "failed") {
  if (error instanceof SpeechError) return error;
  const code = error?.code && MESSAGES[error.code] ? error.code : fallback;
  return new SpeechError(code, error?.code && error?.message ? error.message : MESSAGES[code], { cause: error });
}

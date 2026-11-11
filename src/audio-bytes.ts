// A recording's bytes checked by their structure (public/js/study/audio-bytes.js, pure, which the app runs too, before
// it keeps a recording of yours from your own storage).
import { isMp4Audio as isMp4AudioJs, isMpegAudio as isMpegAudioJs, mpegFrameLength as mpegFrameLengthJs, soundsRight as soundsRightJs } from "../public/js/study/audio-bytes.js";

/** Whether a recording's bytes are what they're declared as (audio/mpeg or audio/mp4), by their structure. */
export const soundsRight = soundsRightJs as (type: string, bytes: Uint8Array) => boolean;
/** The length of the MPEG audio frame whose header starts at at, or 0 when there's no valid header there. */
export const mpegFrameLength = mpegFrameLengthJs as (bytes: Uint8Array, at: number) => number;
export const isMpegAudio = isMpegAudioJs as (bytes: Uint8Array) => boolean;
export const isMp4Audio = isMp4AudioJs as (bytes: Uint8Array) => boolean;

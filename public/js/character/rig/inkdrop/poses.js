// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/poses.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The ink drop's named poses: its expressions and its turnaround. Each is a partial pose for drawDrop(); animations
// blend between them. Never sad at the learner (lex-retention's rule): there's no sad pose, only curious and unsure.

export const EXPRESSIONS = {
  neutral: { face: {} },
  delighted: {
    squash: -0.08,
    face: { closed: ["happy", "happy"], mouth: { type: "open", open: 0.75, asym: 0.25, w: 17 } },
  },
  curious: {
    lean: 0.16, tip: 0.25,
    face: { look: [0.45, 0.35], top: [0, 0.18], brows: { show: 1, raise: [0.9, 0.15], tilt: [0.1, -0.15] }, mouth: { type: "o", open: 0.3, w: 13 } },
  },
  listening: {
    lean: 0.2, tip: 0.55, curl: 1.35,
    face: { look: [0.75, 0.05], top: [0.12, 0.12], bottom: [0.25, 0.25], mouth: { type: "smile", smile: 0.5, w: 8 } },
  },
  concentrating: {
    squash: 0.06,
    face: { look: [0, -0.45], top: [0.35, 0.35], tilt: [0.18, 0.18], brows: { show: 1, raise: [-0.4, -0.4], tilt: [-0.2, -0.2] }, mouth: { type: "flat", w: 8, asym: 0.5 } },
  },
  surprised: {
    squash: -0.18, curl: 0.8,
    face: { pupil: 0.62, brows: { show: 1, raise: [1, 1], tilt: [0, 0] }, mouth: { type: "o", open: 0.7, w: 11 } },
  },
  unsure: {
    lean: -0.1,
    face: { look: [0.6, 0.15], top: [0.2, 0.05], brows: { show: 1, raise: [0.1, 0.7], tilt: [0, 0.2] }, mouth: { type: "hm", w: 11 } },
  },
  content: {
    squash: 0.04,
    face: { bottom: [0.38, 0.38], look: [0, 0.25], mouth: { type: "smile", smile: 1.2, w: 11, asym: 0.4 } },
  },
  sleepy: {
    squash: 0.12, lean: 0.12, curl: 1.3, tip: 0.4,
    face: { closed: ["calm", "calm"], mouth: { type: "smile", smile: 0.4, w: 7 } },
  },
};

export const TURNS = {
  front: { face: { turn: 0 } },
  "three-quarter": { face: { turn: 0.55, look: [0.35, 0] } },
  side: { face: { turn: 1, look: [0.8, 0], eyeScale: [0, 1] } },
  back: { shade: 1, face: { mouth: { type: "none" }, closed: [null, null], eyeScale: [0.001, 0.001] }, flip: true },
};

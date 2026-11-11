#!/usr/bin/env node
// A word picture's stories (public/js/study/reactions/): each is drawn over the still in public/pictures with the hash the manifest has; every frame is a pure function of
// time, allowed by the art rules, and small enough to draw; each starts on its still's own shapes; its end holds. A story has a happy, a sad, or both (one alone
// is a story: the player keeps the still for the other); a story with neither, or with a mood the player doesn't play, isn't. A story that breaks any of that
// fails here, shown by broken ones made up below, and one with its sad alone and one with its happy alone pass. The browser side is reaction-check.mjs. (exit 0 = pass)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArt } from "../public/js/lx/art-rules.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MOODS = ["happy", "sad"];
const PICTURES = join(ROOT, "public/pictures");
const manifest = JSON.parse(readFileSync(join(PICTURES, "manifest.json"), "utf8"));
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);
// The player's rule, read from its own source: it needs a DOM to import, and only this line matters here.
const player = readFileSync(join(ROOT, "public/js/study/reactions.js"), "utf8");
const listed = [...player.matchAll(/^\s*([a-z-]+): \(\) => import\("\.\/reactions\/([a-z-]+)\.js"\),$/gm)].map((m) => m[1]);
const results = [];
let failed = 0;
const stage = (name, problems) => {
  results.push(`${problems.length ? "FAIL" : "ok  "} ${name}${problems.length ? `: ${problems.slice(0, 3).join("; ")}` : ""}`);
  if (problems.length) failed++;
};

/** Everything that can be wrong with one story, on its own text. */
export function problemsOf(story, stillText) {
  const problems = [];
  const shapes = (text) => [...text.matchAll(/ d="([^"]+)"/g)].length;
  if (!story.STILL_HASH || story.STILL_HASH !== hash(stillText)) problems.push("drawn from another still");
  if (story.STILL !== stillText && String(story.STILL).length !== stillText.length) problems.push("carries another still's text");
  const moods = MOODS.filter((mood) => story.REACTIONS?.[mood]);
  if (!moods.length) problems.push("it has neither a happy nor a sad");
  for (const mood of Object.keys(story.REACTIONS ?? {})) if (!MOODS.includes(mood)) problems.push(`a mood the player doesn't play: ${mood}`);
  for (const mood of moods) {
    const dur = story.REACTIONS[mood].dur;
    if (!(dur > 0)) {
      problems.push(`${mood} has no length`);
      continue;
    }
    const times = Array.from({ length: 61 }, (_, i) => (i / 60) * dur);
    const once = times.map((t) => story.frame(mood, t));
    const again = [...times].reverse().map((t) => story.frame(mood, t)).reverse();
    const changed = once.filter((text, i) => text !== again[i]).length;
    if (changed) problems.push(`${mood}: ${changed} frames differ on a second draw`);
    if (story.frame(mood, dur) !== story.frame(mood, dur + 5)) problems.push(`${mood}: its end doesn't hold`);
    const moved = once.filter((text, i) => i && text !== once[i - 1]).length;
    if (moved < 10) problems.push(`${mood}: only ${moved} changes`);
    for (const text of once) {
      const refused = checkArt(text);
      if (refused.length) {
        problems.push(`${mood}: ${refused[0]}`);
        break;
      }
    }
    if (shapes(once[0]) < shapes(stillText) - 2) problems.push(`${mood}: starts with fewer shapes than its still`);
  }
  return problems;
}

stage("the player lists its stories", listed.length ? [] : ["none"]);
for (const id of listed) {
  const story = await import(join(ROOT, `public/js/study/reactions/${id}.js`));
  const entry = manifest.pictures[id];
  const stillText = readFileSync(join(PICTURES, entry?.file ?? `${id}.svg`), "utf8");
  const lengths = MOODS.filter((mood) => story.REACTIONS?.[mood]).map((mood) => `${mood} ${Number(story.REACTIONS[mood].dur).toFixed(2)} s`);
  stage(`${id}: ${lengths.join(" and ") || "no mood"}${lengths.length === 1 ? " alone" : ""}`, problemsOf(story, stillText));
  stage(`${id}: the manifest's hash is the one it was drawn from`, entry?.h === story.STILL_HASH ? [] : [`manifest ${entry?.h}, story ${story.STILL_HASH}`]);
}

// The checks can fail: the same reading on stories that are each wrong one way.
{
  const still = readFileSync(join(PICTURES, manifest.pictures[listed[0]].file), "utf8");
  const good = await import(join(ROOT, `public/js/study/reactions/${listed[0]}.js`));
  const base = { STILL: good.STILL, STILL_HASH: good.STILL_HASH, REACTIONS: good.REACTIONS, frame: good.frame };
  const mustFail = (name, broken) => {
    const found = problemsOf({ ...base, ...broken }, still);
    stage(`control, ${name}, is refused`, found.length ? [] : ["it passed"]);
  };
  mustFail("a redrawn still", { STILL_HASH: "0000000000" });
  let n = 0;
  mustFail("frames that depend on what came before", { frame: (mood, t) => good.frame(mood, t).replace("<rect", `<!--${n++}--><rect`) });
  mustFail("an end that doesn't hold", { frame: (mood, t) => good.frame(mood, t > good.REACTIONS[mood].dur ? 0 : t) });
  mustFail("a story that doesn't move", { frame: () => still });
  mustFail("a frame that isn't plain shapes", { frame: (mood, t) => good.frame(mood, t).replace("<rect", "<image/><rect") });
  mustFail("a frame out of the palette", { frame: (mood, t) => good.frame(mood, t).replace(/#231F3B/g, "#231F3C") });
  mustFail("a story with neither a happy nor a sad", { REACTIONS: {} });
  mustFail("a mood the player doesn't play", { REACTIONS: { ...good.REACTIONS, glad: good.REACTIONS.happy } });
  mustFail("its sad alone, with no length", { REACTIONS: { sad: { dur: 0 } } });
  // ...and one mood alone is a story, either one.
  const mustPass = (name, part) => {
    const found = problemsOf({ ...base, ...part }, still);
    stage(`control, ${name}, is a story`, found.length ? found : []);
  };
  mustPass("its sad alone", { REACTIONS: { sad: good.REACTIONS.sad } });
  mustPass("its happy alone", { REACTIONS: { happy: good.REACTIONS.happy } });
}
console.log(results.join("\n"));
console.log(failed ? `${failed} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);

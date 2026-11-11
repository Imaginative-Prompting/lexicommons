// Which calm pose Tinta takes at Today's streak spot (lex-character's Tinta there; this only chooses): a rest day used
// (it holds a little umbrella), or a missed day mended (it holds up a patch). Calm, no mood at you, nothing about a
// gap (docs/design/retention/tinta-places.md). Pure: the streak (know/streak.js streakOf) and today's day key in, out
// { pose, day }: pose "rest" | "mended" | null, day the square it's about (yesterday's), or null.
import { addDays } from "./streak.js";

export function todayPose(streak, today) {
  const yesterday = addDays(today, -1);
  const status = streak?.statuses?.[yesterday];
  // Mended (the day after a miss, its finished things covering it): the patch, for the rest of today.
  if (status === "mended") return { pose: "mended", day: yesterday };
  // A rest day held the streak yesterday: the umbrella, until today counts too.
  if (status === "rested" && streak.state !== "done") return { pose: "rest", day: yesterday };
  return { pose: null, day: null };
}

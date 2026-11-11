// What the app itself spent, from Chrome's trace of a page (translate-check's speed stage). Wall time (a task's dur) grows with whatever
// else holds the thread; thread time (tdur, the CPU the thread got) doesn't, and Chrome's own CPU throttle counts in it (measured 7 Nov 2026:
// 16.6 ms of work read 68–70 ms of tdur, and of wall, at 4×), so a limit set at 4× holds against tdur as it stands. On this machine the
// page's main thread wasn't starved even at a load average of 88 (its tasks' wall and CPU the same), so a long task there is real work.
// Each thread's tasks with both; the CPU a thread spent between two page times; the app's own long work judged on it.

export const TRACE_CATEGORIES = "devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,toplevel";

const TASKS = new Set(["RunTask", "ThreadControllerImpl::RunTask"]);
const ENTRIES = new Set(["FunctionCall", "EvaluateScript", "v8.evaluateModule"]);

/** The outermost of these events: none inside another (sorted by start, the longer first on a tie). */
function outermost(events) {
  const sorted = [...events].sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
  const kept = [];
  for (const e of sorted) {
    const last = kept.at(-1);
    if (!last || e.ts >= last.ts + (last.dur ?? 0)) kept.push(e);
  }
  return kept;
}

/**
 * Reads a trace (Tracing.dataCollected's events) for one page. `mark` is a performance.mark the page made and `markAt` its startTime: the
 * mark names the page's main thread and lines the trace's clock up with the page's. Returns null when the mark isn't there. Each thread
 * (the main one, and every worker of the page's process, named by the script it runs) has its tasks, each with ts and dur (µs, the
 * trace's clock) and tdur (its CPU; its dur where the trace has none, and threadTime false).
 */
export function readTrace(events, { mark, markAt }) {
  const marked = events.find((e) => e.name === mark && /user_timing/.test(e.cat ?? ""));
  if (!marked) return null;
  const { pid, tid } = marked;
  const toTrace = (ms) => (ms - markAt) * 1000 + marked.ts;
  const names = new Map();
  for (const e of events) if (e.ph === "M" && e.name === "thread_name" && e.pid === pid) names.set(e.tid, e.args?.name ?? "");
  const byThread = new Map();
  for (const e of events) {
    if (e.pid !== pid || e.ph !== "X" || typeof e.ts !== "number") continue;
    if (!byThread.has(e.tid)) byThread.set(e.tid, []);
    byThread.get(e.tid).push(e);
  }
  const threadOf = (t) => {
    const all = byThread.get(t) ?? [];
    const tasks = outermost(all.filter((e) => TASKS.has(e.name))).map((e) => ({ ts: e.ts, dur: e.dur ?? 0, tdur: typeof e.tdur === "number" ? e.tdur : e.dur ?? 0, threadTime: typeof e.tdur === "number" }));
    const url = all.find((e) => ENTRIES.has(e.name) && typeof e.args?.data?.url === "string" && e.args.data.url)?.args.data.url ?? "";
    return { tid: t, name: names.get(t) ?? "", url, tasks };
  };
  const main = threadOf(tid);
  const workers = [...byThread.keys()].filter((t) => t !== tid && /Worker/i.test(names.get(t) ?? "")).map(threadOf);
  /** The CPU (ms) a thread's tasks spent between two page times, a task the window cuts counted for its share inside. */
  const cpuBetween = (thread, from, to) => {
    const a = toTrace(from);
    const b = toTrace(to);
    let sum = 0;
    for (const task of thread?.tasks ?? []) {
      const overlap = Math.min(b, task.ts + task.dur) - Math.max(a, task.ts);
      if (overlap > 0 && task.dur > 0) sum += (task.tdur * overlap) / task.dur;
    }
    return sum / 1000;
  };
  return { main, workers, cpuBetween };
}

/**
 * The app's own long work while typing, judged on CPU. What ran comes from the Long Animation Frames API (every script it names, a
 * promise's callback too, which the trace files under no script of its own), each with its window in page time; its CPU is the main
 * thread's thread time inside that window. A script of the app's own (`ours`) with `limit` ms of CPU or more, or a frame's style and layout
 * with that much, is the app's (own); one long by the clock but short on CPU is the machine's, said with both numbers.
 * frames: [{ layoutAt, layout, scripts: [{ ours, src, fn, invoker, at, ms }] }].
 */
export function judgeFrames(frames, read, limit = 50) {
  const own = [];
  const machine = [];
  for (const f of frames) {
    for (const x of f.scripts) {
      if (!x.ours || x.ms < limit) continue;
      const cpu = read.cpuBetween(read.main, x.at, x.at + x.ms);
      const said = `${x.src} ${x.fn || x.invoker} ${Math.round(cpu)} ms of CPU (${Math.round(x.ms)} ms by the clock)`;
      (cpu >= limit ? own : machine).push({ cpu, wall: x.ms, said });
    }
    if (f.layout >= limit) {
      const cpu = read.cpuBetween(read.main, f.layoutAt, f.layoutAt + f.layout);
      const said = `the page's style and layout ${Math.round(cpu)} ms of CPU (${Math.round(f.layout)} ms by the clock)`;
      (cpu >= limit ? own : machine).push({ cpu, wall: f.layout, said });
    }
  }
  return { own, machine };
}

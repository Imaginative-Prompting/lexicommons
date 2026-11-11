// A word picture reacts to your answer: a short story that finishes, and its last pose stays until the next question. The tile you tapped goes happy
// or sad; when you were wrong, the right one goes happy too. Decoration on a game that's already answered: it holds nothing up, a press finishes it at
// once (lx/motion.js, rule 4), and with animations off only the still shows. A picture's story is its own file beside this one, and safe to be missing:
// no file, a file that won't load, or a still redrawn since its story (the manifest's hash says so), and the picture just stays as it is.
//
// A story: frame(mood, t) -> the whole drawing as text at t seconds, the same text however it's reached, and REACTIONS[mood].dur for each mood it has. A
// story may have one mood only (a sad of its own, with no honest happy): a tile asked for the other keeps the card's own pop or shake on its still, as a
// picture with no story does. They hold to the art rules (lx/art-rules.js); scripts/test-reactions.mjs reads every one.

import * as motion from "../lx/motion.js";
import { pictureList } from "./pictures.js";
import { setStories } from "./lesson.js";

const STORIES = {
  coffee: () => import("./reactions/coffee.js"),
  phone: () => import("./reactions/phone.js"),
  car: () => import("./reactions/car.js"),
  pocket: () => import("./reactions/pocket.js"),
  money: () => import("./reactions/money.js"),
  city: () => import("./reactions/city.js"),
  cup: () => import("./reactions/cup.js"),
  office: () => import("./reactions/office.js"),
  room: () => import("./reactions/room.js"),
  photo: () => import("./reactions/photo.js"),
  school: () => import("./reactions/school.js"),
  week: () => import("./reactions/week.js"),
  police: () => import("./reactions/police.js"),
  night: () => import("./reactions/night.js"),
  light: () => import("./reactions/light.js"),
  heart: () => import("./reactions/heart.js"),
  tea: () => import("./reactions/tea.js"),
  water: () => import("./reactions/water.js"),
  milk: () => import("./reactions/milk.js"),
  sofa: () => import("./reactions/sofa.js"),
  door: () => import("./reactions/door.js"),
  film: () => import("./reactions/film.js"),
  book: () => import("./reactions/book.js"),
  house: () => import("./reactions/house.js"),
  bed: () => import("./reactions/bed.js"),
  evening: () => import("./reactions/evening.js"),
  party: () => import("./reactions/party.js"),
  key: () => import("./reactions/key.js"),
  bit: () => import("./reactions/bit.js"),
  day: () => import("./reactions/day.js"),
  time: () => import("./reactions/time.js"),
  treasure: () => import("./reactions/treasure.js"),
  pizza: () => import("./reactions/pizza.js"),
  chance: () => import("./reactions/chance.js"),
  dollar: () => import("./reactions/dollar.js"),
  today: () => import("./reactions/today.js"),
  train: () => import("./reactions/train.js"),
  late: () => import("./reactions/late.js"),
  tomorrow: () => import("./reactions/tomorrow.js"),
  on: () => import("./reactions/on.js"),
  coat: () => import("./reactions/coat.js"),
  gift: () => import("./reactions/gift.js"),
  pay: () => import("./reactions/pay.js"),
  against: () => import("./reactions/against.js"),
  outside: () => import("./reactions/outside.js"),
  new: () => import("./reactions/new.js"),
  beautiful: () => import("./reactions/beautiful.js"),
  out: () => import("./reactions/out.js"),
  old: () => import("./reactions/old.js"),
  window: () => import("./reactions/window.js"),
  find: () => import("./reactions/find.js"),
  chair: () => import("./reactions/chair.js"),
  big: () => import("./reactions/big.js"),
  through: () => import("./reactions/through.js"),
  letter: () => import("./reactions/letter.js"),
  buy: () => import("./reactions/buy.js"),
  return: () => import("./reactions/return.js"),
  begin: () => import("./reactions/begin.js"),
  ready: () => import("./reactions/ready.js"),
  inside: () => import("./reactions/inside.js"),
  hour: () => import("./reactions/hour.js"),
  fast: () => import("./reactions/fast.js"),
  closed: () => import("./reactions/closed.js"),
  behind: () => import("./reactions/behind.js"),
  bad: () => import("./reactions/bad.js"),
  help: () => import("./reactions/help.js"),
  wrong: () => import("./reactions/wrong.js"),
  two: () => import("./reactions/two.js"),
  small: () => import("./reactions/small.js"),
  bag: () => import("./reactions/bag.js"),
  difficult: () => import("./reactions/difficult.js"),
  place: () => import("./reactions/place.js"),
  three: () => import("./reactions/three.js"),
  first: () => import("./reactions/first.js"),
  far: () => import("./reactions/far.js"),
  plan: () => import("./reactions/plan.js"),
  pair: () => import("./reactions/pair.js"),
  send: () => import("./reactions/send.js"),
  exactly: () => import("./reactions/exactly.js"),
  lose: () => import("./reactions/lose.js"),
  free: () => import("./reactions/free.js"),
  month: () => import("./reactions/month.js"),
  little: () => import("./reactions/little.js"),
  next: () => import("./reactions/next.js"),
  write: () => import("./reactions/write.js"),
  win: () => import("./reactions/win.js"),
  lost: () => import("./reactions/lost.js"),
  four: () => import("./reactions/four.js"),
  safe: () => import("./reactions/safe.js"),
  part: () => import("./reactions/part.js"),
  full: () => import("./reactions/full.js"),
  tall: () => import("./reactions/tall.js"),
  luck: () => import("./reactions/luck.js"),
  hat: () => import("./reactions/hat.js"),
  bottle: () => import("./reactions/bottle.js"),
  egg: () => import("./reactions/egg.js"),
  watch: () => import("./reactions/watch.js"),
  in: () => import("./reactions/in.js"),
  open: () => import("./reactions/open.js"),
  story: () => import("./reactions/story.js"),
  jacket: () => import("./reactions/jacket.js"),
  second: () => import("./reactions/second.js"),
  calm: () => import("./reactions/calm.js"),
  hallway: () => import("./reactions/hallway.js"),
  sweet: () => import("./reactions/sweet.js"),
  young: () => import("./reactions/young.js"),
  captain: () => import("./reactions/captain.js"),
  prison: () => import("./reactions/prison.js"),
  message: () => import("./reactions/message.js"),
  hole: () => import("./reactions/hole.js"),
  cold: () => import("./reactions/cold.js"),
  rich: () => import("./reactions/rich.js"),
  fire: () => import("./reactions/fire.js"),
  fall: () => import("./reactions/fall.js"),
  camera: () => import("./reactions/camera.js"),
  wall: () => import("./reactions/wall.js"),
  clothes: () => import("./reactions/clothes.js"),
  boat: () => import("./reactions/boat.js"),
  elevator: () => import("./reactions/elevator.js"),
  island: () => import("./reactions/island.js"),
  kitchen: () => import("./reactions/kitchen.js"),
  bridge: () => import("./reactions/bridge.js"),
  choice: () => import("./reactions/choice.js"),
  heavy: () => import("./reactions/heavy.js"),
  deep: () => import("./reactions/deep.js"),
  tire: () => import("./reactions/tire.js"),
  nine: () => import("./reactions/nine.js"),
  store: () => import("./reactions/store.js"),
  mountain: () => import("./reactions/mountain.js"),
  drawer: () => import("./reactions/drawer.js"),
  radio: () => import("./reactions/radio.js"),
  suitcase: () => import("./reactions/suitcase.js"),
  cabinet: () => import("./reactions/cabinet.js"),
  dinner: () => import("./reactions/dinner.js"),
  gate: () => import("./reactions/gate.js"),
  plant: () => import("./reactions/plant.js"),
  farm: () => import("./reactions/farm.js"),
  diamond: () => import("./reactions/diamond.js"),
  beach: () => import("./reactions/beach.js"),
  truck: () => import("./reactions/truck.js"),
  tent: () => import("./reactions/tent.js"),
  bedroom: () => import("./reactions/bedroom.js"),
  garage: () => import("./reactions/garage.js"),
  bathroom: () => import("./reactions/bathroom.js"),
  shirt: () => import("./reactions/shirt.js"),
  clock: () => import("./reactions/clock.js"),
  airport: () => import("./reactions/airport.js"),
  market: () => import("./reactions/market.js"),
  shower: () => import("./reactions/shower.js"),
  robot: () => import("./reactions/robot.js"),
  fence: () => import("./reactions/fence.js"),
  leaf: () => import("./reactions/leaf.js"),
  nest: () => import("./reactions/nest.js"),
  chain: () => import("./reactions/chain.js"),
  pen: () => import("./reactions/pen.js"),
  cave: () => import("./reactions/cave.js"),
  bicycle: () => import("./reactions/bicycle.js"),
  dog: () => import("./reactions/dog.js"),
  shed: () => import("./reactions/shed.js"),
  refrigerator: () => import("./reactions/refrigerator.js"),
  satellite: () => import("./reactions/satellite.js"),
  jump: () => import("./reactions/jump.js"),
  drunk: () => import("./reactions/drunk.js"),
  cheers: () => import("./reactions/cheers.js"),
  eat: () => import("./reactions/eat.js"),
  read: () => import("./reactions/read.js"),
  sit: () => import("./reactions/sit.js"),
  stand: () => import("./reactions/stand.js"),
  mother: () => import("./reactions/mother.js"),
};

// A picture question prefers wrong choices that have a story (lesson.js), when they're as fair as the rest.
setStories((id) => typeof id === "string" && Object.hasOwn(STORIES, id));

// How late a story may land and still play: the card's own pop answers the tap at once, so the story is the second beat, and up to a second (the limit
// for keeping a flow unbroken) it still reads as this answer's. Past it, eyes are on the result, and the still stays.
const LATEST = 1000;
let runs = 0;
let active = 0;
/** How many stories are drawing now (for checks). */
export const reactionsRunning = () => active;

const stories = new Map(); // id -> Promise<story | null>
const storyOf = (id) => {
  if (!stories.has(id)) {
    const loading = (async () => {
      try {
        const [story, list] = await Promise.all([STORIES[id](), pictureList()]);
        return mayPlay(story, list?.pictures?.[id]) ? story : null;
      } catch {
        return null;
      }
    })();
    stories.set(id, loading);
    // A failure isn't final: the next question tries again.
    loading.then((story) => story || stories.delete(id));
  }
  return stories.get(id);
};

/** A story plays only over the still it was drawn from. */
export const mayPlay = (story, entry) => Boolean(story?.STILL_HASH && entry?.h === story.STILL_HASH);

/** The pictures that have a story, in the order their stories were made (Settings → Admin → Pictures). */
export const storyIds = () => Object.keys(STORIES);

/** One picture's story on its own tile (Settings → Admin → Pictures): the same story by the same rules as an answer's, starting at once (no card's pop to wait for). */
export function playStory(tile, id, mood) {
  if (!motion.motionOn()) return;
  play({ children: [tile] }, [id], 0, mood, 0);
}

/** Gets a question's stories ready, so they start on time. ids: each choice's concept, or null. Never rejects. */
export function prepareReactions(ids) {
  if (!motion.motionOn()) return;
  for (const id of ids) if (id && Object.hasOwn(STORIES, id)) storyOf(id);
}

/**
 * The answer's reactions, on a pictureChoices grid. ids: each choice's concept, or null, in the grid's order. Returns nothing to wait for. A question without
 * pictures, or a picture without a story, does nothing.
 */
export function reactToAnswer(grid, ids, correctIndex, picked) {
  if (!motion.motionOn()) return;
  const right = picked === correctIndex;
  play(grid, ids, picked, right ? "happy" : "sad");
  if (!right) play(grid, ids, correctIndex, "happy");
}

function play(grid, ids, index, mood, delay = motion.duration("--dur-320", 320)) {
  const id = ids[index];
  if (!id || !Object.hasOwn(STORIES, id)) return;
  const svg = grid.children[index]?.querySelector('[data-part="picture"] > svg');
  if (!svg) return;
  // The card's own pop or shake is a ghost that hides the real tile until it lands (motion.decorate), so the story starts there, from the still. A press
  // before then finishes it just the same.
  const tappedAt = performance.now();
  let startsAt = tappedAt + delay;
  let ticker = null;
  let frame = 0;
  let finishedEarly = false;
  let story = null;
  const prefix = `r${++runs}-`;
  const draw = (t) => {
    if (!story) return;
    const text = story.frame(mood, t);
    // Only what's inside the drawing, each with this tile's own ids, so any number can share a screen.
    svg.innerHTML = text.slice(text.indexOf(">") + 1, text.lastIndexOf("</svg>")).replace(/\bid="/g, `id="${prefix}`).replace(/url\(#/g, `url(#${prefix}`);
  };
  let over = false;
  const done = () => {
    if (over) return;
    over = true;
    active--;
  };
  const tick = (now) => {
    if (!svg.isConnected) {
      done();
      ticker?.end();
      return;
    }
    const t = (now - startsAt) / 1000;
    if (t >= story.REACTIONS[mood].dur) {
      draw(story.REACTIONS[mood].dur);
      done();
      ticker?.end();
      return;
    }
    if (t > 0) draw(t);
    frame = requestAnimationFrame(tick);
  };
  active++;
  ticker = motion.registerTicker(() => {
    finishedEarly = true;
    cancelAnimationFrame(frame);
    if (story && svg.isConnected) draw(story.REACTIONS[mood].dur);
    done();
  });
  if (!ticker) return;
  storyOf(id).then((loaded) => {
    // A story can land late (a slow phone, a first visit, a quick tap). Up to LATEST after the tap it still reads as this answer's reaction; past that, a
    // picture moving on its own would read as a glitch, so the still stays. A story without this mood (a sad alone, asked for its happy) leaves the
    // tile as the card's pop or shake left it, the same.
    if (!loaded || !loaded.REACTIONS?.[mood] || !svg.isConnected || performance.now() - tappedAt > LATEST) {
      if (!finishedEarly) {
        done();
        ticker.end();
      }
      return;
    }
    story = loaded;
    // Pressed before it landed: the press asked for its end, so it lands on its last pose.
    if (finishedEarly) {
      draw(story.REACTIONS[mood].dur);
      return;
    }
    // Landed after its moment to start: it starts now, from its first frame, never partway in.
    startsAt = Math.max(startsAt, performance.now());
    frame = requestAnimationFrame(tick);
  });
}


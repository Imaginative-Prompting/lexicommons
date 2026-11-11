// Applies the saved appearance before the first paint, so a light theme or a custom look never flashes in after the
// default. A classic (blocking) script: load it in <head>, before the stylesheets. theme.js takes over once the
// page's modules run and reuses these two stylesheets through window.lxThemeSheets. The stored CSS was checked by
// theme.js when it was saved (and is checked again there on load). Images come later, from IndexedDB. On a page
// opened with ?safe only the theme and presets apply.
//
// It also keeps the app from zooming where the page's viewport says so (the app and signing in): iOS lets people pinch
// whatever the viewport says, so its gesture events are refused here. Text gets bigger through Settings' text size.
// Every file the page loads is listed (the app's first open hands the list to its service worker: shell/main.js), and
// the app loads more than the browser's default 250.
if (window.performance && performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(2000);

(function () {
  var viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport || !/user-scalable=no/.test(viewport.getAttribute("content") || "")) return;
  var refuse = function (event) {
    event.preventDefault();
  };
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (type) {
    document.addEventListener(type, refuse, { passive: false });
  });
})();

(function () {
  // The site's own pages (src/pages.ts lxLayout: signing in) follow the phone's light or dark, never a saved look.
  if (document.documentElement.hasAttribute("data-site-look")) return;
  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem("lx.appearance.v1") || "null");
  } catch (e) {}
  if (!saved || saved.version !== 1) return;

  // Absent attributes mean the defaults, so only saved values need setting here.
  var root = document.documentElement;
  // A ready-made theme (lx/theme-presets.js) sits on its base's rules, Graphite or Paper, with its own tokens over them, kept here by
  // theme.js when it was picked (this script can't work them out).
  var ready = saved.ready && saved.ready.id === saved.theme && /^(graphite|paper)$/.test(saved.ready.base) ? saved.ready : null;
  if (typeof saved.theme === "string") root.setAttribute("data-theme", ready ? ready.base : saved.theme);
  if (ready) root.setAttribute("data-ready", ready.id);
  var presets = saved.presets || {};
  for (var name in presets) {
    if (/^[a-z]+$/.test(name) && typeof presets[name] === "string") root.setAttribute("data-" + name, presets[name]);
  }

  // ?safe: the look is kept but not applied, so a look that broke the page can be fixed or reset.
  if (/[?&]safe(=|&|$)/.test(location.search)) {
    root.setAttribute("data-safe-mode", "");
    return;
  }
  var look = saved.look || {};
  if (!("adoptedStyleSheets" in document)) return;
  try {
    var sheets = (window.lxThemeSheets = { ready: new CSSStyleSheet(), tokens: new CSSStyleSheet(), css: new CSSStyleSheet() });
    // The same test as look-rules.js breaksOut: no ; { } outside quotes, no open quote, line break or trailing \\.
    var quoted = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;
    var sheetOf = function (tokens) {
      var lines = [];
      for (var token in tokens) {
        var value = String(tokens[token]);
        if (/^--[a-z][a-z0-9-]{0,63}$/.test(token) && !/[;{}"'\n\r]|\\$/.test(value.replace(quoted, ""))) lines.push(token + ": " + value + ";");
      }
      // Same as theme.js's tokenSheetText.
      return lines.length ? ":root {" + lines.join(" ") + "}" : "";
    };
    sheets.ready.replaceSync(ready ? sheetOf(ready.tokens || {}) : "");
    // Its scene (a motif's picture) held unseen until it has decoded, then let go to fade in (components.css data-scene-waiting; theme.js
    // holdPicture takes over, sharing what's decoded).
    var picture = ready && /^url\("(\/themes\/[^"]+)"\)$/.exec(String((ready.tokens || {})["--scene"] || ""));
    if (picture) {
      var url = picture[1];
      window.__lxPictureHeld = url;
      root.setAttribute("data-scene-waiting", "");
      var img = new Image();
      img.src = url;
      var letGo = function (decoded) {
        return function () {
          if (decoded) (window.__lxPicturesShown = window.__lxPicturesShown || new Set()).add(url);
          if (window.__lxPictureHeld === url) root.removeAttribute("data-scene-waiting");
        };
      };
      (typeof img.decode === "function" ? img.decode() : Promise.reject()).then(letGo(true), letGo(false));
    }
    sheets.tokens.replaceSync(sheetOf(look.tokens || {}));
    sheets.css.replaceSync(typeof look.css === "string" ? look.css : "");
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheets.ready, sheets.tokens, sheets.css]);
  } catch (e) {}
})();

// The first frame and the splash (js/character/splash-run.js runs it), decided here before the first paint, so the first
// frame (static markup in app/index.html, the same picture as iOS's launch image) is the first thing drawn. The installed
// app, and a newcomer's first run in a browser tab; never off /app/.
// - "hold", every start but the day's first: the first frame stays until the app has drawn (<html data-app-drawn>, from
//   shell/main.js), then fades. Without it, iOS's launch image gives way to black, loading words and an empty frame.
//   Not on a reload: nothing comes before one, and the app is already what's on the screen.
// - "play", the day's first open: the first frame holds the same way, and then the splash plays (splash-run.js).
// - "still" (the day's first, with Animations Off, or a device asking for reduced motion under Match device): its last
//   frame for half a second.
// - A newcomer in a browser tab ("hold"): the app holds its start until the first run comes in whole (shell/main.js mayNeedWelcome: neither
//   lx.welcome.v1 nor lx.learning.v1 kept yet), and the first frame is what that hold shows, then it fades into the first question. With the
//   bare canvas there, a light phone's sign-up page gave way to most of a second of black, then the dark app.
// The day starts at 4 am, as the streak's does.
//
// Until splash-run.js takes over a playing splash (it marks the overlay data-run), its promises are kept here, so none
// of them waits for the app's code to arrive: a press or a key ends it, and that press never reaches the app under it
// (the overlay stays, invisible, until the press is over); the still goes half a second after the first paint (it
// never needs splash-run.js); and one the app's code hasn't ended or started within 6 s steps aside, since the app is
// what matters (its "Loading Lexicommons…" is underneath).
(function () {
  try {
    if (location.pathname.indexOf("/app") !== 0) return;
    var installed = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
    var newcomer = !installed && !localStorage.getItem("lx.welcome.v1") && !localStorage.getItem("lx.learning.v1");
    if (!installed && !newcomer) return;
    var now = new Date(Date.now() - 4 * 3600 * 1000);
    var day = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
    var root = document.documentElement;
    var motion = root.getAttribute("data-motion") || "system";
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var still = motion === "off" || (motion !== "on" && reduced);
    var mode;
    if (newcomer) mode = "hold";
    else if (localStorage.getItem("lx.splash.day") === day) {
      var entry = window.performance && performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (!entry || entry.type !== "navigate") return;
      mode = "hold";
    } else {
      localStorage.setItem("lx.splash.day", day);
      mode = still ? "still" : "play";
    }
    root.setAttribute("data-splash", mode);
    // iOS starts the page a screen tall and takes the status bar off it about 90 ms later, so the first paint would draw the
    // first frame lower than the launch image has it, and then jump. The height it settled at last time holds it in place
    // from the first paint. (A new install's first open has to find that out.)
    var heights = JSON.parse(localStorage.getItem("lx.splash.heights") || "{}");
    var openedWide = innerWidth;
    // (A tab has no launch image to match: no height from before, and none kept from it, below.)
    if (installed && heights[openedWide]) root.style.setProperty("--lx-splash-height", heights[openedWide] + "px");
    window.addEventListener("resize", function () {
      if (innerWidth !== openedWide) root.style.removeProperty("--lx-splash-height"); // turned
    });
  } catch (e) {
    return;
  }

  var overlay = function () {
    return document.querySelector(".lx-splash");
  };
  var takenOver = function () {
    var o = overlay();
    return Boolean(o && o.hasAttribute("data-run"));
  };
  var listen = function (types, fn, on) {
    types.forEach(function (type) {
      if (on) window.addEventListener(type, fn, true);
      else window.removeEventListener(type, fn, true);
    });
  };
  var PRESSES = ["pointerdown", "keydown"], ENDS = ["pointerup", "pointercancel", "keyup"];
  var later = function () {
    setTimeout(off, 60);
  };
  function off() {
    listen(PRESSES, press, false);
    listen(ENDS, later, false);
    if (takenOver()) return;
    var o = overlay();
    if (o) o.remove();
    root.removeAttribute("data-splash");
  }
  function press() {
    listen(PRESSES, press, false);
    if (takenOver()) return; // splash-run.js ends it (through motion.js, which hears the same press)
    var o = overlay();
    if (o) o.setAttribute("data-ended", "");
    listen(ENDS, later, true);
    setTimeout(off, 1500);
  }
  // The fade into the app, the same as splash-run.js's: the overlay's opacity (its own layer, splash.css), set each frame on a clock that
  // moves at most one frame's worth (34 ms) a frame, so a busy main thread holds the fade where it is and it carries on from there; the
  // overlay goes on the frame after it's clear. On a phone, a CSS transition run on its own clock with a 260 ms timer either showed its first
  // frame half way through (its clock had run on while the app finished drawing) or none at all (the timer came first: a cut to the app).
  function fadeAway(o, done) {
    var gone = false, t = 0, last = 0;
    var finish = function () {
      if (gone) return;
      gone = true;
      done();
    };
    o.setAttribute("data-going", "");
    setTimeout(finish, 3000); // whatever comes, it never stays
    var frame = function (now) {
      if (gone || !o.isConnected || o.hasAttribute("data-ended")) return;
      if (last) t += Math.min(34, Math.max(0, now - last));
      last = now;
      var x = Math.min(1, t / 250);
      o.style.opacity = String(Math.round((1 - x) * (1 - x) * 1000) / 1000); // ease-out
      // A theme that colors Tinta: the drop's ink eases from the default into it as it goes (splash.css, character/ink.js).
      o.style.setProperty("--lx-splash-ink", String(Math.round(x * x * (3 - 2 * x) * 1000) / 1000));
      requestAnimationFrame(x >= 1 ? finish : frame);
    };
    requestAnimationFrame(frame);
  }
  listen(PRESSES, press, true);
  // Stepping aside, for a splash its code never took over: a still goes as it came; anything else fades into the app as every other does,
  // never with a cut.
  var stepAside = function () {
    var o = overlay();
    if (takenOver() || (o && (o.hasAttribute("data-ended") || o.hasAttribute("data-going")))) return;
    if (mode === "still" || !o) off();
    else fadeAway(o, off);
  };
  // When: a still after half a second. Anything else at 6 s if the app has drawn by then, else as soon as it has (it never fades into an app
  // half drawn: a slow first load once showed Home's frame with its cards still coming in), and at 12 s whatever happens.
  var since = window.performance ? performance.now() : 0;
  var past6 = false;
  if (mode === "still") setTimeout(stepAside, Math.max(0, 500 - since));
  else {
    setTimeout(function () {
      past6 = true;
      if (root.hasAttribute("data-app-drawn")) stepAside();
    }, Math.max(0, 6000 - since));
    setTimeout(stepAside, Math.max(0, 12000 - since));
  }
  // The app has drawn: the page's height is known for next time, and a held first frame fades over it (fadeAway); one past its 6 s steps aside.
  new MutationObserver(function (records, watching) {
    if (!root.hasAttribute("data-app-drawn")) return;
    watching.disconnect();
    try {
      if (installed) {
        heights[innerWidth] = innerHeight;
        localStorage.setItem("lx.splash.heights", JSON.stringify(heights));
      }
    } catch (e) {}
    if (past6) return stepAside();
    if (mode !== "hold") return;
    var o = overlay();
    if (!o || o.hasAttribute("data-ended") || o.hasAttribute("data-going")) return;
    if (still) return off();
    fadeAway(o, off);
  }).observe(root, { attributes: true, attributeFilter: ["data-app-drawn"] });
  // A newcomer's hold: the first run is the first page, so the splash fades over it the frame after it comes in whole (shell/welcome.js puts
  // it on <body> with its flags drawn), not once Home is drawn under it as well (most of a second later). Only <body>'s own children are
  // watched, never the whole page as it's built.
  if (newcomer) {
    var welcomed = function (records, watching) {
      if (!document.querySelector("body > .lx-welcome")) return;
      watching.disconnect();
      var o = overlay();
      if (!o || o.hasAttribute("data-ended") || o.hasAttribute("data-going")) return;
      if (still) return off();
      // The fade runs on the compositor (an opacity animation), not on fadeAway's clock: the app builds Home under the first run right after
      // it, most of a second of the main thread, and a clock that moves only with the page's frames stood a fifth of a second on its first
      // step (begun at once) or began that much later (begun after it). An animation starts when its first frame is shown, so never part way.
      requestAnimationFrame(function () {
        if (!o.animate) return fadeAway(o, off);
        o.setAttribute("data-going", "");
        var gone = false;
        var finish = function () {
          if (gone) return;
          gone = true;
          off();
        };
        o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)", fill: "forwards" }).finished.then(finish, finish);
        setTimeout(finish, 3000); // whatever comes, it never stays
      });
    };
    var watchBody = function () {
      new MutationObserver(welcomed).observe(document.body, { childList: true });
    };
    if (document.body) watchBody();
    else
      new MutationObserver(function (records, watching) {
        if (!document.body) return;
        watching.disconnect();
        watchBody();
      }).observe(root, { childList: true });
  }
})();

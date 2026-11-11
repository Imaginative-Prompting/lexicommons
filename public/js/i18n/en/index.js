// The interface's English, one module per area of the app (lx/i18n.js reads them all). An area's keys start with its
// name ("core.", "welcome."). A new area is a new module here and in public/sw.js SHELL, and its files in
// scripts/fixtures/i18n-areas.json.

import core from "./core.js";
import welcome from "./welcome.js";
import home from "./home.js";
import know from "./know.js";
import study from "./study.js";
import translate from "./translate.js";
import settings from "./settings.js";
import explore from "./explore.js";
import site from "./site.js";

export const AREAS = { core, welcome, home, know, study, translate, settings, explore, site };

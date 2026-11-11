// Service worker: keeps the app shell available offline. Pages that change who you are or what you can reach
// (sign-in, consent, the gate, every API, MCP, uploads) always go to the network and are never cached.

const VERSION = "shell-654";
// The whole app shell, so it works offline straight after install. Bump VERSION (and the ?v= in app/index.html)
// whenever these change.
const SHELL = [
  "/app/",
  "/js/lx/theme-boot.js?v=654",
  "/css/lx/tokens.css?v=654",
  "/css/lx/art.css",
  "/css/lx/base.css?v=654",
  "/css/lx/components.css?v=654",
  "/css/lx/presets.css?v=654",
  "/css/lx/appearance.css?v=654",
  "/css/shell.css?v=654",
  "/css/splash.css?v=654",
  "/js/shell/main.js?v=654",
  "/js/shell/api.js",
  "/js/shell/route.js",
  "/js/lx/i18n.js",
  "/js/lx/locales.js",
  "/js/i18n/shipped.js",
  "/js/i18n/en/index.js",
  "/js/i18n/en/core.js",
  "/js/i18n/en/welcome.js",
  "/js/i18n/en/home.js",
  "/js/i18n/en/know.js",
  "/js/i18n/en/study.js",
  "/js/i18n/en/translate.js",
  "/js/i18n/en/settings.js",
  "/js/i18n/en/explore.js",
  "/js/i18n/en/site.js",
  "/js/shell/interface-language.js",
  "/js/shell/interface-rules.js",
  "/js/translate/models.js",
  "/js/translate/model-worker.js",
  "/js/shell/settings-translate.js",
  "/js/shell/settings-downloads.js",
  "/js/shell/sharing.js",
  "/js/shell/settings-flags.js",
  "/js/shell/settings-pictures.js",
  "/vendor/bergamot/bergamot-translator.js",
  "/js/shell/study.js",
  "/js/shell/settings.js",
  "/js/shell/settings-streak.js",
  "/js/shell/welcome.js",
  "/js/shell/todo.js",
  "/js/shell/install-guide.js",
  "/js/shell/settings-install.js",
  "/js/shell/layout.js",
  "/js/explore/explore.js",
  "/js/explore/own.js",
  "/js/explore/home-data.js",
  "/js/explore/requests.js",
  "/js/explore/grammar.js",
  "/js/explore/terms.js",
  "/js/explore/books.js",
  "/js/explore/suggest-way.js",
  "/js/know/today.js",
  "/js/know/word-index.js",
  "/js/know/home-cards.js",
  "/js/know/today-pose.js",
  "/js/know/page.js",
  "/js/know/concept.js",
  "/js/know/activity-names.js",
  "/js/know/cards.js",
  "/js/know/cards-more.js",
  "/js/know/week-tinta.js",
  "/js/know/slices.js",
  "/js/know/words-page.js",
  "/js/know/ideas-page.js",
  "/js/know/week-page.js",
  "/js/know/everyday-page.js",
  "/js/know/time-page.js",
  "/js/know/pile.js",
  "/js/know/summary.js",
  "/js/know/streak.js",
  "/js/know/streak-days.js",
  "/js/know/celebrate.js",
  "/js/know/celebration-ui.js",
  "/js/know/share-card.js",
  "/js/lx/sound.js",
  "/js/lx/sound-kit.js",
  "/audio/fx/right.mp3",
  "/audio/fx/wrong.mp3",
  "/audio/fx/tile-in-1.mp3",
  "/audio/fx/tile-in-2.mp3",
  "/audio/fx/tile-out-1.mp3",
  "/audio/fx/tile-out-2.mp3",
  "/audio/fx/match-1.mp3",
  "/audio/fx/match-2.mp3",
  "/audio/fx/match-3.mp3",
  "/audio/fx/match-4.mp3",
  "/audio/fx/match-5.mp3",
  "/audio/fx/match-6.mp3",
  "/audio/fx/match-7.mp3",
  "/audio/fx/match-8.mp3",
  "/audio/fx/match-last.mp3",
  "/audio/fx/match-miss.mp3",
  "/audio/fx/session-done.mp3",
  "/audio/fx/day-counted.mp3",
  "/audio/fx/unit-done.mp3",
  "/audio/fx/path-press.mp3",
  "/audio/fx/tinta-hop.mp3",
  "/js/know/ui.js",
  "/js/lx/error-report.js",
  "/js/lx/reload-holds.js",
  "/js/lx/error-clean.js",
  "/js/lx/bug-rules.js",
  "/js/lx/report-form.js",
  "/js/lx/ui.js",
  "/js/lx/bidi.js",
  "/js/lx/shapes.js",
  "/js/lx/icons.js",
  "/js/lx/art-rules.js",
  "/js/lx/symbols.js",
  "/js/lx/game-art.js",
  "/js/lx/stop-art.js",
  "/js/lx/edge.js",
  "/js/study/doors.js",
  "/js/study/strip-hop.js",
  "/js/study/path-page.js",
  "/js/study/starter-note.js",
  "/js/study/path-layout.js",
  "/js/study/after-answer.js",
  "/js/study/rule-examples.js",
  "/js/study/learn-more.js",
  "/js/study/learn-senses.js",
  "/js/study/reword.js",
  "/js/study/idea-parts.js",
  "/js/study/concept-picture.js",
  "/js/study/concept-shape.js",
  "/js/study/shape-marks.js",
  "/js/lx/brands.js",
  "/js/lx/motion.js",
  "/js/character/character.js",
  "/js/character/firsts.js",
  "/js/character/ink.js",
  "/js/character/ink-tokens.js",
  "/js/character/stand.js",
  "/js/character/speaking.js",
  "/js/character/splash-run.js",
  "/js/character/theme-wipe.js",
  "/js/character/rig/kit/speech.js",
  "/js/character/rig/splash/splash.js",
  "/js/character/rig/kit/anim.js",
  "/js/character/rig/kit/acting.js",
  "/js/character/rig/kit/geom.js",
  "/js/character/rig/kit/flat.js",
  "/js/character/rig/kit/face.js",
  "/js/character/rig/kit/liquid.js",
  "/js/character/rig/kit/svg.js",
  "/js/character/rig/inkdrop/inkdrop.js",
  "/js/character/rig/inkdrop/poses.js",
  "/js/character/rig/inkdrop/shapes.js",
  "/js/character/rig/inkdrop/clips.js",
  "/js/character/rig/inkdrop/liquid-clips.js",
  "/js/character/rig/inkdrop/tinta.js",
  "/js/character/rig/inkdrop/states-retention.js",
  "/js/character/rig/inkdrop/states-places.js",
  "/js/character/rig/inkdrop/today-throw.js",
  "/js/character/rig/inkdrop/read-line.js",
  "/js/character/rig/inkdrop/poke.js",
  "/js/character/rig/inkdrop/hop-to.js",
  "/js/character/rig/inkdrop/idle-motion.js",
  "/js/character/rig/inkdrop/held.js",
  "/js/character/sharpen.js",
  "/js/character/rig/inkdrop/throw.js",
  "/js/character/rig/splat/field.js",
  "/js/character/rig/splat/throw.js",
  "/js/character/rig/splat/acts.js",
  "/js/lx/theme.js",
  "/js/lx/theme-presets.js",
  "/js/lx/theme-flags.js",
  "/js/lx/theme-motifs.js",
  "/js/lx/theme-names.js",
  "/js/lx/parts.js",
  "/js/lx/css-safety.js",
  "/js/lx/look-rules.js",
  "/js/lx/look-sync.js",
  "/js/lx/retry.js",
  "/js/lx/appearance.js",
  "/js/shell/look-watch.js",
  "/js/shell/settings-email.js",
  "/js/shell/settings-report.js",
  "/js/shell/new-version.js",
  "/js/study/content.js",
  "/js/study/written.js",
  "/js/study/pack-words.js",
  "/js/study/pack-known.js",
  "/js/study/pack-format.js",
  "/js/study/pack-items.js",
  "/js/study/pack-notes.js",
  "/js/study/notes.js",
  "/js/study/notes-worker.js",
  "/js/study/deck.js",
  "/js/anki/language.js",
  "/js/study/deck-steps.js",
  "/js/study/pack-audio.js",
  "/js/study/keep-clips.js",
  "/js/study/clips.js",
  "/js/study/audio-bytes.js",
  "/js/study/packs.js",
  "/js/study/pack-hash-worker.js",
  "/js/study/pack-put-worker.js",
  "/js/study/grammar.js",
  "/js/study/pack-actions.js",
  "/js/study/pack-authoring.js",
  "/js/study/pack-inbox.js",
  "/js/study/learning.js",
  "/js/packs/index.js",
  "/js/packs/starter-word-order.js",
  "/js/lang/index.js",
  "/js/lang/grammar.js",
  "/js/lang/en.js",
  "/js/lang/nl.js",
  "/js/lang/af.js",
  "/js/lang/ar.js",
  "/js/lang/az.js",
  "/js/lang/be.js",
  "/js/lang/bg.js",
  "/js/lang/br.js",
  "/js/lang/bs.js",
  "/js/lang/ca.js",
  "/js/lang/ckb.js",
  "/js/lang/cs.js",
  "/js/lang/cy.js",
  "/js/lang/da.js",
  "/js/lang/de.js",
  "/js/lang/el.js",
  "/js/lang/eo.js",
  "/js/lang/es.js",
  "/js/lang/et.js",
  "/js/lang/eu.js",
  "/js/lang/fa.js",
  "/js/lang/fi.js",
  "/js/lang/fr.js",
  "/js/lang/fy.js",
  "/js/lang/ga.js",
  "/js/lang/gd.js",
  "/js/lang/gl.js",
  "/js/lang/gu.js",
  "/js/lang/haw.js",
  "/js/lang/he.js",
  "/js/lang/hi.js",
  "/js/lang/hr.js",
  "/js/lang/ht.js",
  "/js/lang/hu.js",
  "/js/lang/hy.js",
  "/js/lang/id.js",
  "/js/lang/is.js",
  "/js/lang/it.js",
  "/js/lang/ja.js",
  "/js/lang/ka.js",
  "/js/lang/kk.js",
  "/js/lang/kmr.js",
  "/js/lang/ko.js",
  "/js/lang/la.js",
  "/js/lang/lb.js",
  "/js/lang/lt.js",
  "/js/lang/lv.js",
  "/js/lang/mk.js",
  "/js/lang/mr.js",
  "/js/lang/ms.js",
  "/js/lang/mt.js",
  "/js/lang/nb.js",
  "/js/lang/ne.js",
  "/js/lang/pa.js",
  "/js/lang/pl.js",
  "/js/lang/ps.js",
  "/js/lang/pt.js",
  "/js/lang/readings.js",
  "/js/lang/romaji.js",
  "/js/lang/ro.js",
  "/js/lang/ru.js",
  "/js/lang/sk.js",
  "/js/lang/sl.js",
  "/js/lang/sq.js",
  "/js/lang/sr.js",
  "/js/lang/sv.js",
  "/js/lang/sw.js",
  "/js/lang/th.js",
  "/js/lang/tl.js",
  "/js/lang/tr.js",
  "/js/lang/uk.js",
  "/js/lang/ur.js",
  "/js/lang/uz.js",
  "/js/lang/vi.js",
  "/js/lang/yi.js",
  "/js/lang/yue.js",
  "/js/lang/zh.js",
  "/js/lang/zh-Hant.js",
  "/js/shell/page-slide.js",
  "/js/lang/flags.js",
  "/js/study/pack-corrections.js",
  "/js/lx/literal-case.js",
  "/js/ai/marks.js",
  "/js/ai/connection.js",
  "/js/ai/study-record.js",
  "/js/ai/tab.js",
  "/js/ai/ask.js",
  "/js/study/progress.js",
  "/js/study/done.js",
  "/js/study/scheduler.js",
  "/js/study/frequency.js",
  "/vendor/ts-fsrs/index.mjs",
  "/js/study/attribute.js",
  "/js/study/plan.js",
  "/js/study/warm-idle.js",
  "/js/study/new-words.js",
  "/js/study/plan-kept.js",
  "/js/lang/not-first.nl.js",
  "/js/lang/form-concepts.js",
  "/js/lang/form-senses.nl.js",
  "/js/lang/not-a-choice.nl.js",
  "/js/lang/idea-parts.nl.js",
  "/js/lang/literal-ok.nl.js",
  "/js/lang/idea-parts.es.js",
  "/js/lang/literal-ok.es.js",
  "/js/lang/idea-parts.fr.js",
  "/js/lang/literal-ok.fr.js",
  "/js/lang/idea-parts.de.js",
  "/js/lang/literal-ok.de.js",
  "/js/lang/idea-parts.pt.js",
  "/js/lang/literal-ok.pt.js",
  "/js/lang/idea-parts.it.js",
  "/js/lang/literal-ok.it.js",
  "/js/lang/literal-ok.ru.js",
  "/js/lang/literal-ok.ja.js",
  "/js/study/path.js",
  "/js/study/lesson.js",
  "/js/study/games-sheet.js",
  "/js/study/quick-play.js",
  "/js/study/game-modes.js",
  "/js/study/concept-focus.js",
  "/js/study/concepts-sheet.js",
  "/js/study/pictures.js",
  "/js/study/reactions.js",
  "/js/study/reactions/kit.js",
  "/js/study/reactions/coffee.js",
  "/js/study/reactions/phone.js",
  "/js/study/reactions/car.js",
  "/js/study/reactions/pocket.js",
  "/js/study/reactions/money.js",
  "/js/study/reactions/city.js",
  "/js/study/reactions/cup.js",
  "/js/study/reactions/office.js",
  "/js/study/reactions/room.js",
  "/js/study/reactions/photo.js",
  "/js/study/reactions/school.js",
  "/js/study/reactions/week.js",
  "/js/study/reactions/police.js",
  "/js/study/reactions/night.js",
  "/js/study/reactions/light.js",
  "/js/study/reactions/heart.js",
  "/js/study/reactions/tea.js",
  "/js/study/reactions/water.js",
  "/js/study/reactions/milk.js",
  "/js/study/reactions/sofa.js",
  "/js/study/reactions/door.js",
  "/js/study/reactions/film.js",
  "/js/study/reactions/book.js",
  "/js/study/reactions/house.js",
  "/js/study/reactions/bed.js",
  "/js/study/reactions/evening.js",
  "/js/study/reactions/party.js",
  "/js/study/reactions/key.js",
  "/js/study/reactions/bit.js",
  "/js/study/reactions/day.js",
  "/js/study/reactions/time.js",
  "/js/study/reactions/treasure.js",
  "/js/study/reactions/pizza.js",
  "/js/study/reactions/chance.js",
  "/js/study/reactions/dollar.js",
  "/js/study/reactions/today.js",
  "/js/study/reactions/train.js",
  "/js/study/reactions/late.js",
  "/js/study/reactions/tomorrow.js",
  "/js/study/reactions/on.js",
  "/js/study/reactions/coat.js",
  "/js/study/reactions/gift.js",
  "/js/study/reactions/pay.js",
  "/js/study/reactions/against.js",
  "/js/study/reactions/outside.js",
  "/js/study/reactions/new.js",
  "/js/study/reactions/beautiful.js",
  "/js/study/reactions/out.js",
  "/js/study/reactions/old.js",
  "/js/study/reactions/window.js",
  "/js/study/reactions/find.js",
  "/js/study/reactions/chair.js",
  "/js/study/reactions/big.js",
  "/js/study/reactions/through.js",
  "/js/study/reactions/letter.js",
  "/js/study/reactions/buy.js",
  "/js/study/reactions/return.js",
  "/js/study/reactions/begin.js",
  "/js/study/reactions/ready.js",
  "/js/study/reactions/inside.js",
  "/js/study/reactions/hour.js",
  "/js/study/reactions/fast.js",
  "/js/study/reactions/closed.js",
  "/js/study/reactions/behind.js",
  "/js/study/reactions/bad.js",
  "/js/study/reactions/help.js",
  "/js/study/reactions/wrong.js",
  "/js/study/reactions/two.js",
  "/js/study/reactions/small.js",
  "/js/study/reactions/bag.js",
  "/js/study/reactions/difficult.js",
  "/js/study/reactions/place.js",
  "/js/study/reactions/three.js",
  "/js/study/reactions/first.js",
  "/js/study/reactions/far.js",
  "/js/study/reactions/plan.js",
  "/js/study/reactions/pair.js",
  "/js/study/reactions/send.js",
  "/js/study/reactions/exactly.js",
  "/js/study/reactions/lose.js",
  "/js/study/reactions/free.js",
  "/js/study/reactions/month.js",
  "/js/study/reactions/little.js",
  "/js/study/reactions/next.js",
  "/js/study/reactions/write.js",
  "/js/study/reactions/win.js",
  "/js/study/reactions/lost.js",
  "/js/study/reactions/four.js",
  "/js/study/reactions/safe.js",
  "/js/study/reactions/part.js",
  "/js/study/reactions/full.js",
  "/js/study/reactions/tall.js",
  "/js/study/reactions/luck.js",
  "/js/study/reactions/hat.js",
  "/js/study/reactions/bottle.js",
  "/js/study/reactions/egg.js",
  "/js/study/reactions/watch.js",
  "/js/study/reactions/in.js",
  "/js/study/reactions/open.js",
  "/js/study/reactions/story.js",
  "/js/study/reactions/jacket.js",
  "/js/study/reactions/second.js",
  "/js/study/reactions/calm.js",
  "/js/study/reactions/hallway.js",
  "/js/study/reactions/sweet.js",
  "/js/study/reactions/young.js",
  "/js/study/reactions/captain.js",
  "/js/study/reactions/prison.js",
  "/js/study/reactions/message.js",
  "/js/study/reactions/hole.js",
  "/js/study/reactions/cold.js",
  "/js/study/reactions/rich.js",
  "/js/study/reactions/fire.js",
  "/js/study/reactions/fall.js",
  "/js/study/reactions/camera.js",
  "/js/study/reactions/wall.js",
  "/js/study/reactions/clothes.js",
  "/js/study/reactions/boat.js",
  "/js/study/reactions/elevator.js",
  "/js/study/reactions/island.js",
  "/js/study/reactions/kitchen.js",
  "/js/study/reactions/bridge.js",
  "/js/study/reactions/choice.js",
  "/js/study/reactions/heavy.js",
  "/js/study/reactions/deep.js",
  "/js/study/reactions/tire.js",
  "/js/study/reactions/nine.js",
  "/js/study/reactions/store.js",
  "/js/study/reactions/mountain.js",
  "/js/study/reactions/drawer.js",
  "/js/study/reactions/radio.js",
  "/js/study/reactions/suitcase.js",
  "/js/study/reactions/cabinet.js",
  "/js/study/reactions/dinner.js",
  "/js/study/reactions/gate.js",
  "/js/study/reactions/plant.js",
  "/js/study/reactions/farm.js",
  "/js/study/reactions/diamond.js",
  "/js/study/reactions/beach.js",
  "/js/study/reactions/truck.js",
  "/js/study/reactions/tent.js",
  "/js/study/reactions/bedroom.js",
  "/js/study/reactions/garage.js",
  "/js/study/reactions/bathroom.js",
  "/js/study/reactions/shirt.js",
  "/js/study/reactions/clock.js",
  "/js/study/reactions/airport.js",
  "/js/study/reactions/market.js",
  "/js/study/reactions/shower.js",
  "/js/study/reactions/robot.js",
  "/js/study/reactions/fence.js",
  "/js/study/reactions/leaf.js",
  "/js/study/reactions/nest.js",
  "/js/study/reactions/chain.js",
  "/js/study/reactions/pen.js",
  "/js/study/reactions/cave.js",
  "/js/study/reactions/bicycle.js",
  "/js/study/reactions/dog.js",
  "/js/study/reactions/shed.js",
  "/js/study/reactions/refrigerator.js",
  "/js/study/reactions/satellite.js",
  "/js/study/reactions/jump.js",
  "/js/study/reactions/drunk.js",
  "/js/study/reactions/rig.js",
  "/js/study/reactions/person-woman.js",
  "/js/study/reactions/cheers.js",
  "/js/study/reactions/eat.js",
  "/js/study/reactions/read.js",
  "/js/study/reactions/sit.js",
  "/js/study/reactions/stand.js",
  "/js/study/reactions/mother.js",
  "/js/study/path-place.js",
  "/js/study/session.js",
  "/js/study/gap-marks.js",
  "/js/study/typed.js",
  "/js/study/subjects.js",
  "/js/lang/subjects.js",
  "/js/study/sample-mode.js",
  "/js/study/sample-learner.js",
  "/js/study/sample-start.js",
  "/js/study/settings.js",
  "/js/study/voice.js",
  "/js/study/speaking.js",
  "/js/shell/settings-voice.js",
  "/js/shell/settings-packs.js",
  "/js/shell/settings-pack-edit.js",
  "/js/practice/protocol.js",
  "/js/ai/requests.js",
  "/js/ai/client.js",
  "/js/ai/inapp.js",
  "/js/ai/own-key.js",
  "/js/ai/hosted.js",
  "/js/translate/engine.js",
  "/js/translate/translate.js",
  "/js/translate/page.js",
  "/js/translate/translator.js",
  "/js/translate/picker.js",
  "/js/translate/worker.js",
  "/js/translate/readings.js",
  "/js/practice/home.js",
  "/js/practice/room.js",
  "/js/practice/inapp-run.js",
  "/js/practice/guide.js",
  "/js/practice/transcript.js",
  "/js/practice/cards.js",
  "/js/practice/listen.js",
  "/js/practice/store.js",
  "/js/practice/learner.js",
  "/js/practice/ui.js",
  "/css/lx/practice.css?v=654",
  "/css/lx/reader.css?v=654",
  "/css/lx/know.css?v=654",
  "/css/lx/translate.css?v=654",
  "/css/lx/explore.css?v=654",
  "/css/lx/read.css?v=654",
  "/css/lx/redesign.css?v=654",
  "/css/lx/study-screens.css?v=654",
  "/css/lx/path-page.css?v=654",
  "/js/read/store.js",
  "/js/read/highlights.js",
  "/js/read/search.js",
  "/js/read/import-text.js",
  "/js/read/import-epub.js",
  "/js/read/text-inbox.js",
  "/js/read/cover-svg.js",
  "/js/read/zip.js",
  "/js/read/reader.js",
  "/js/read/weave-languages.generated.js",
  "/js/read/pages.js",
  "/js/read/library.js",
  "/js/read/paste-language.js",
  "/js/read/book-format.js",
  "/js/read/demo-sample.js",
  "/js/read/woven-text.js",
  "/js/read/bank.js",
  "/js/read/hold.js",
  "/js/read/shelf.js",
  "/js/read/weave-own.js",
  "/js/read/readable.js",
  "/js/read/find.js",
  "/audio/starter-word-order/manifest.json",
  "/audio/silence.mp3",
  "/js/storage.js",
  "/js/sync.js",
  "/js/push.js",
  "/js/shell/settings-reminders.js",
  "/js/speech/speech.js",
  "/js/speech/match.js",
  "/js/speech/errors.js",
  "/js/speech/guard.js",
  "/js/speech/browser.js",
  "/js/speech/mic.js",
  "/js/lx/audio-session.js",
  "/js/speech/capture-worklet.js",
  "/js/speech/models.js",
  "/js/speech/store.js",
  "/js/speech/whisper.js",
  "/js/speech/whisper-worker.js",
  // With every module it imports: settings.js imports it, so without them the app can't start offline.
  "/vendor/simplewebauthn/index.js",
  "/vendor/simplewebauthn/helpers/base64URLStringToBuffer.js",
  "/vendor/simplewebauthn/helpers/browserSupportsPasskeys.js",
  "/vendor/simplewebauthn/helpers/browserSupportsWebAuthn.js",
  "/vendor/simplewebauthn/helpers/browserSupportsWebAuthnAutofill.js",
  "/vendor/simplewebauthn/helpers/bufferToBase64URLString.js",
  "/vendor/simplewebauthn/helpers/getBrowserCapabilities.js",
  "/vendor/simplewebauthn/helpers/identifyAuthenticationError.js",
  "/vendor/simplewebauthn/helpers/identifyRegistrationError.js",
  "/vendor/simplewebauthn/helpers/identifySignalError.js",
  "/vendor/simplewebauthn/helpers/isValidDomain.js",
  "/vendor/simplewebauthn/helpers/platformAuthenticatorIsAvailable.js",
  "/vendor/simplewebauthn/helpers/toAuthenticatorAttachment.js",
  "/vendor/simplewebauthn/helpers/toPublicKeyCredentialDescriptor.js",
  "/vendor/simplewebauthn/helpers/webAuthnAbortService.js",
  "/vendor/simplewebauthn/helpers/webAuthnError.js",
  "/vendor/simplewebauthn/methods/sendSignal.js",
  "/vendor/simplewebauthn/methods/startAuthentication.js",
  "/vendor/simplewebauthn/methods/startRegistration.js",
  "/vendor/simplewebauthn/types/index.js",
  "/vendor/simplewebauthn/types/dom.js",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/fonts/instrument-sans-var.woff2",
  "/fonts/onest-var-latin.woff2",
  "/fonts/onest-var-cyrillic.woff2",
  "/fonts/geist-mono-var-latin.woff2",
];
const NEVER_CACHE = [
  "/api/",
  "/mcp",
  "/authorize",
  "/login",
  "/_gate",
  "/upload/",
  "/token",
  "/register",
  "/.well-known/",
  "/app/storage/callback",
  "/app/storage/onedrive",
  "/app/key/callback",
  // The speech models: public/js/speech/store.js downloads and keeps them in its own cache, never here.
  "/models/",
  // The word pictures: study/pictures.js keeps them in its own cache, under names carrying their hashes, across deploys.
  "/pictures/",
];
// The speech model's libraries live in the speech cache beside the model (store.js), so a new app version doesn't
// throw them away while the model stays.
const SPEECH_CACHE = "lx-speech-v1";
const SPEECH_LIBRARIES = ["/vendor/transformers/", "/vendor/ort/"];
// A script's own font (Noto Arabic, Hebrew, Nastaliq) is fetched only by a page that shows those letters, so it isn't
// in the shell; once fetched it's kept in its own cache, which a new app version leaves alone, so it works offline.
const FONT_CACHE = "lx-fonts-v1";
// The Words card's pile had a physics engine of its own, kept in this cache (Rapier, 3.4 MB) until 9 Nov 2026: no longer used, so it goes.
const OLD_PHYSICS_CACHE = "lx-physics-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL).then(() => keepRecordings(cache)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Only older copies of the shell, and the pile's old physics; the speech cache (and anything else) stays.
      .then((keys) => Promise.all(keys.filter((key) => (key.startsWith("shell-") && key !== VERSION) || key === OLD_PHYSICS_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  if (NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (event.request.mode === "navigate") {
    // Network first for pages, so a deploy shows up at once; the cached shell when offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only the shell itself is cached as the offline page (never a storage callback or another page).
          // A redirect (to sign-in, when signed out) is never cached as the app.
          if (response.ok && !response.redirected && url.pathname === "/app/") {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put("/app/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/app/")),
    );
    return;
  }

  // A library recording is kept by voice.js once it has played (lx-audio-v1); the browser asks for it in byte ranges.
  if (url.pathname.startsWith("/library/audio/")) return;

  // Static files: network first, so a deploy is live on the next load; the cached copy only when offline.
  // (Cache-first would keep running the previous app code after every deploy.)
  const into = cacheOf(url);
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only a whole file (a part, 206, can't be cached).
        if (response.status === 200) {
          const copy = response.clone();
          caches.open(into).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      // Offline: the kept copy, and for a request asking for a range (an audio element's), the part asked for.
      .catch(() => caches.match(event.request).then((kept) => (kept && event.request.headers.has("range") ? partOf(kept, event.request.headers.get("range")) : kept))),
  );
});

// Which cache keeps a file (null: none, the network only): the speech libraries' and the fonts' own, else the shell's.
// The API, sign-in and the rest of NEVER_CACHE, other sites, and the library's recordings (voice.js keeps those) never.
function cacheOf(url) {
  if (url.origin !== location.origin || NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix)) || url.pathname.startsWith("/library/audio/")) return null;
  return SPEECH_LIBRARIES.some((prefix) => url.pathname.startsWith(prefix)) ? SPEECH_CACHE : url.pathname.startsWith("/fonts/noto-") ? FONT_CACHE : VERSION;
}

// A first open (shell/main.js): the files the page loaded before this worker took it, kept as if they'd come through
// here (the language's flag, a script's font), so the app opens offline as it looked. Paths on this site only, each
// kept where a fetch would keep it, a whole 200 only; what's kept already stays.
self.addEventListener("message", (event) => {
  // Which version this worker is (shell/new-version.js asks the one that has just taken its page), on the port it was given.
  if (event.data?.ask === "version") {
    event.ports?.[0]?.postMessage({ version: VERSION });
    return;
  }
  const keep = event.data?.keep;
  if (!Array.isArray(keep)) return;
  event.waitUntil(
    (async () => {
      for (const path of keep.slice(0, 2000)) {
        if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) continue;
        const url = new URL(path, location.origin);
        const into = cacheOf(url);
        if (!into || url.pathname === "/app/" || (await caches.match(url.href))) continue;
        try {
          const response = await fetch(url.href, { credentials: "same-origin" });
          if (response.status === 200) await (await caches.open(into)).put(url.href, response);
        } catch {
          // The network's gone already: nothing more to keep.
          return;
        }
      }
    })(),
  );
});

// The starter's recordings inside the app (public/audio/), kept whole with the shell so a card plays offline: every clip
// its manifests in SHELL name. One that can't be fetched is left out and never stops the install (test-sw-shell.mjs
// holds that each one is there).
async function keepRecordings(cache) {
  const clips = new Set();
  for (const path of SHELL.filter((p) => /^\/audio\/[^/]+\/manifest\.json$/.test(p))) {
    try {
      const manifest = await (await cache.match(path)).json();
      const base = path.slice(0, path.lastIndexOf("/"));
      for (const voice of Object.values(manifest.voices ?? {}))
        for (const group of [voice.items, voice.words])
          for (const entry of Object.values(group ?? {}))
            if (typeof entry?.src === "string" && /^[\w-]+(\/[\w-]+)*\.(mp3|m4a)$/.test(entry.src)) clips.add(`${base}/${entry.src}`);
    } catch {
      // A manifest that won't read keeps nothing more.
    }
  }
  await Promise.allSettled([...clips].map((url) => cache.add(url)));
}

// The part of a kept file a request asks for (an audio element asks for ranges, and Safari plays nothing without a
// 206): those bytes, the whole file for a range it can't read, or 416 for one past the end.
async function partOf(response, range) {
  const bytes = await response.arrayBuffer();
  const size = bytes.byteLength;
  const asked = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!asked || (asked[1] === "" && asked[2] === "")) return new Response(bytes, { status: 200, headers: response.headers });
  const start = asked[1] === "" ? Math.max(0, size - Number(asked[2])) : Number(asked[1]);
  const end = asked[1] === "" || asked[2] === "" ? size - 1 : Math.min(Number(asked[2]), size - 1);
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

// ---------- reminders (src/reminders.ts sends them; push.js subscribes) ----------

// Where a notification may open: only a page of the app itself.
const appUrl = (value) => {
  try {
    const url = new URL(typeof value === "string" ? value : "/app/", location.origin);
    return url.origin === location.origin && url.pathname.startsWith("/app/") ? url.href : `${location.origin}/app/`;
  } catch {
    return `${location.origin}/app/`;
  }
};

// Every push shows a notification (Safari ends a subscription whose pushes don't). The message is Declarative Web
// Push's JSON ({ web_push: 8030, notification: { title, body, navigate, … } }): newer Safari shows it itself, every
// other browser hands it here. The app icon's badge counts the notifications not yet opened.
self.addEventListener("push", (event) => {
  let n = {};
  try {
    n = event.data?.json()?.notification ?? {};
  } catch {}
  const title = typeof n.title === "string" && n.title ? n.title.slice(0, 80) : "Lexicommons";
  const body = typeof n.body === "string" ? n.body.slice(0, 200) : "";
  event.waitUntil(
    self.registration
      .showNotification(title, { body, lang: "en", dir: "ltr", icon: "/icons/icon-192.png", data: { url: appUrl(n.navigate) } })
      .then(() => self.registration.getNotifications())
      .then((shown) => self.navigator.setAppBadge?.(shown.length))
      .catch(() => {}),
  );
});

// A tap opens the page it names: in the app's window when it's open, else a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = appUrl(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const shown = await self.registration.getNotifications();
      await self.navigator.setAppBadge?.(shown.length).catch?.(() => {});
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const app = windows.find((w) => new URL(w.url).pathname.startsWith("/app/"));
      if (app) {
        await app.focus();
        return app.navigate(url).catch(() => app.postMessage({ type: "open", url }));
      }
      return self.clients.openWindow(url);
    })(),
  );
});

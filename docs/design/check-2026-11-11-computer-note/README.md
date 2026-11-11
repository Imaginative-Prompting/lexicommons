# On a computer: the note on the sign-in pages (11 Nov 2026)

The site went public with a video; a visitor on a laptop meets an app made for phones first. On a computer, Create your account and Sign
in now say so, quietly, with the way onto a phone: "Lexicommons is made for phones first, and that's where it's been tested most: on a
computer, some screens are less polished. To learn on your phone, open lexicommons.com there, or point its camera at this code."

- Where: the end of the sign-in card, under the ways in (src/pages.ts computerNote), drawn hidden. Not when an AI app is asking to connect.
- Who sees it: login.js shows it where shell/install-guide.js's detect() says the device isn't mobile (an iPad asking for desktop pages, a
  Mac's user agent with touch, is mobile there) and isn't an app's own browser. Nothing kept; nothing waits for it.
- The code: `public/icons/site/qr-lexicommons.svg`, https://lexicommons.com (segno, version 2, error level M, a 4-module quiet zone, 1.2 KB),
  dark on its own white so a camera reads it in either theme, lazy, so a phone never fetches it. zbarimg decodes it from every still here.
- The words: `public/js/i18n/en/core.js` core.computer.note, .phone and .qr (the alt), read by src/pages.ts as the not-found page's are.

## Checks

`note-check.mjs` 9/9: on a computer (Chrome on a Mac) at 1280×800 and 1440×900, light and dark, Create your account shows the note with its
code, and Sign in does; an iPhone, an iPad asking for desktop pages and an Android tablet show none and never fetch the code; the control,
that iPad's user agent without touch reads as a Mac and shows it. test-i18n (through check-gate), test-refusal-words, test-site-pages,
test-install 10/10, the typecheck; gate-check public 16/16 on a fresh state with the live config's own values.

This local copy has no Google or GitHub sign-in; live has those two rows above the form, so at 1280×800 the note is a scroll down there.
Beside the card on a wide window is the next change (the director's first desktop item).

## Beside the card on a wide window (the same day, after the director's look)

With Google's and GitHub's rows (live has both) the note fell under the fold at 1280 × 800. From 960 px wide, while it's shown, the card is two
columns: the ways in, and the note in a 280 px column 48 px beside them, centered on the ways (level with the form), its code above its
words; the page grows by that column and stays in the middle (signin.css; src/pages.ts draws the note right after the ways in, and a
narrower window keeps it at the card's end with `order`). A phone's and a tablet's page match none of it (the note stays hidden there).
note-check 15/15 with the rows drawn (`beside-*.png`: at 1280 × 800 the note spans 310–541 px, in view with no scroll), stacked at 900
(`under-create-900-light.png`); gate-check public 16/16 again.

// The Anki parser's worker: a plain worker, because sql.js (MIT, public/vendor/anki/) is a plain script that doesn't run as a
// module. Everything else is in read.js. Nothing in a deck runs here or anywhere: this only keeps the page free while it's read,
// and lets the page end it outright (anki/import.js) if it takes too long.
importScripts("/vendor/anki/sql-wasm.js");
const reading = import("./read.js");
self.onmessage = async ({ data }) => {
  const { handle } = await reading;
  handle(data, self, self.initSqlJs);
};

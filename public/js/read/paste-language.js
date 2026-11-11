// Whether a pasted text looks like it's in the language you're learning: from how much of it this device knows as that
// language's words, and as English. Pure. A plain share can't decide it: with only a starter on the device, a real Dutch
// article scores 6%, and with the word packs 97% (measured 4 Nov 2026). So a text counts when most of it is known, or when
// enough is, well ahead of English. When it can't tell, it says nothing and the person chooses.

const MOST = 0.5; // this much known in the language is enough, unless English knows more
const ENOUGH = 0.15; // the least that counts with little on the device: a few words in common with another language score about this
const AHEAD = 2; // and how far ahead of English it has to be then

export function looksLike(share, english) {
  if (share >= MOST) return share > english;
  return share >= ENOUGH && share >= english * AHEAD;
}

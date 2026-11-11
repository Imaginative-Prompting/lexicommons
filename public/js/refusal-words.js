// What a sign-in page says when the server refuses (login.js, login-recover.js): the server's words, never its code. A refusal carries its words
// in `message` beside a code in `error` (app.ts's cross_site), or its words in `error` alone (accounts.ts, account-email.ts), or only a code (a
// 500's internal_error); a bare code (lowercase letters, digits and underscores) is never shown, and the words below stand in for it.
const CODE = /^[a-z0-9_]+$/;
export const SOMETHING_WRONG = "Something went wrong. Try again.";

/** The words to show for a refused request's JSON body (anything, even nothing). */
export function refusalWords(body) {
  for (const words of [body?.message, body?.error]) {
    if (typeof words === "string" && words.trim() && !CODE.test(words.trim())) return words.trim();
  }
  return SOMETHING_WRONG;
}

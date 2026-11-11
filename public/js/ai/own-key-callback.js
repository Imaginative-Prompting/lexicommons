// OpenRouter sends the browser back here with a code (Connect with OpenRouter, ai/own-key.js): trade it for this account's key,
// kept on this device, then return to the AI section. The code leaves the address before anything else happens.
import { finishOpenRouter } from "/js/ai/own-key.js";
import { whoAmI } from "/js/shell/api.js";

const status = document.getElementById("status");
const search = location.search;
history.replaceState(null, "", "/app/key/callback");
try {
  const me = await whoAmI();
  const key = await finishOpenRouter(search, me.user.id);
  sessionStorage.setItem("lx.own-key.flash", `${key.providerName} connected. Your key is on this device only.`);
  location.replace("/app/#ai/connect");
} catch (error) {
  status.textContent = error.message;
  document.getElementById("back").hidden = false;
}

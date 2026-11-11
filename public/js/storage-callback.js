// The storage provider sends the browser back here with a code (/app/storage/callback, or /app/storage/onedrive for OneDrive through the
// site: the Entra app's Web redirect); trade it, then return to the app.
import { finishConnect, PROVIDERS } from "/js/storage.js";

const status = document.getElementById("status");
try {
  const provider = await finishConnect(location.search);
  sessionStorage.setItem("lc_storage_flash", `${PROVIDERS[provider]} connected.`);
  // Drop the code from history before leaving (this page, or OneDrive's own: /app/storage/onedrive).
  history.replaceState(null, "", location.pathname);
  location.replace("/app/#settings/storage");
} catch (error) {
  status.textContent = error.message;
  document.getElementById("back").hidden = false;
}

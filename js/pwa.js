/* =========================================================================
   pwa.js — Service worker registration + "update available" prompt.
   ========================================================================= */
import { toast } from "./core/ui.js";
import { I18N } from "./i18n.js";

export function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  // Captured before the new SW can claim the page, so we can tell a real update
  // (had a controller) from a first install (clients.claim on an uncontrolled page).
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // Tell the user when a new version has been installed and is waiting.
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            toast(I18N.t("toast.updated"));
          }
        });
      });
    }).catch(() => {});
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only refresh on a real update — never on the first-install claim of an
    // uncontrolled page (which would cause a gratuitous reload/flash).
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

/* =========================================================================
   auth/index.js — getAuth(): pick the auth provider for this environment.
   Probes the optional backend (GET api/health). If reachable → Remote
   (real accounts + cloud sync). Otherwise → Local (in-browser accounts).
   Either way the rest of the app talks to one uniform provider interface.
   ========================================================================= */
import { LocalAuthProvider } from "./local.js";
import { session } from "./session.js";

async function backendReachable() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(new URL("api/health", document.baseURI).href, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function getAuth() {
  // Set a default synchronously so session.provider is never null while the
  // router renders and a user could submit the login/register form.
  session.setProvider(LocalAuthProvider, "local");

  if (await backendReachable()) {
    try {
      const { RemoteAuthProvider } = await import("./remote.js");
      session.setProvider(RemoteAuthProvider, "remote");
    } catch (e) {
      /* keep local */
    }
  }

  // Best-effort restore of an existing session.
  try {
    await session.provider.me();
  } catch (e) {}
  return session.provider;
}

import { useEffect } from "react";
import { syncExtension, useSession } from "./auth";

const MIN_GAP_MS = 10_000;

/**
 * Gives the extension its (limited) token whenever a page loads and whenever the tab regains focus, not only at
 * sign-in. A reinstalled extension, cleared extension storage or an extension installed after signing in therefore
 * recovers on its own instead of silently recording nothing (decisions.md, D-12).
 */
export function ExtensionTokenSync() {
  const signedIn = useSession().status === "signedIn";

  useEffect(() => {
    if (!signedIn) return;
    let last = 0;
    const sync = () => {
      if (Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      void syncExtension();
    };
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [signedIn]);
  return null;
}

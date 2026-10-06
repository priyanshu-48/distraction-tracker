import { useEffect } from "react";
import { syncToken } from "@/lib/extension";
import { getToken } from "./auth";

const MIN_GAP_MS = 10_000;

/**
 * Hands the login token to the extension whenever a page loads and whenever the tab regains focus, not
 * only at sign-in. A reinstalled extension, cleared extension storage or an extension installed after
 * signing in therefore recovers on its own instead of silently recording nothing (decisions.md, D-12).
 */
export function ExtensionTokenSync() {
  useEffect(() => {
    let last = 0;
    const sync = () => {
      const token = getToken();
      if (!token || Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      void syncToken(token);
    };
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);
  return null;
}

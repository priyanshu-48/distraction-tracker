import { focusManager, QueryClient } from "@tanstack/react-query";

/**
 * The extension uploads the visit you just left at about the same moment the dashboard tab
 * regains focus. Refetching instantly could race that upload and show stale numbers, so the
 * "focused again" signal is delayed slightly. See decisions.md, D-22.
 */
export const REFOCUS_DELAY_MS = 1500;

/**
 * For live views (Today, a week or month in progress, the session state): refresh every minute while the tab is
 * visible, and on every return to the tab even when the data is still inside `staleTime`. Without "always", a quick
 * trip to another site (under 30 s) and back showed the old numbers until the next minute tick.
 */
export const liveQueryOptions = {
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
} as const;

focusManager.setEventListener((handleFocus) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onChange = () => {
    clearTimeout(timer);
    if (document.visibilityState === "visible") {
      timer = setTimeout(() => handleFocus(true), REFOCUS_DELAY_MS);
    } else {
      handleFocus(false);
    }
  };
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

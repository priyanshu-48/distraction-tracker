import { focusManager, QueryClient } from "@tanstack/react-query";

/**
 * The extension uploads the visit you just left at about the same moment the dashboard tab
 * regains focus. Refetching instantly could race that upload and show stale numbers, so the
 * "focused again" signal is delayed slightly. See decisions.md, D-22.
 */
export const REFOCUS_DELAY_MS = 1500;

/** For live views (Today, Trends): refresh every minute, only while the tab is visible. */
export const liveQueryOptions = {
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
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

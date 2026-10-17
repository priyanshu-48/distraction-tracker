// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { liveQueryOptions, REFOCUS_DELAY_MS } from "./queryClient"; // importing it installs the delayed focus listener

// What the user sees: leave the dashboard for a few seconds, come back, and the numbers should already include that visit.
let client: QueryClient;
let visibility: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient();
  client.mount();
  visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  client.unmount();
  visibility.mockRestore();
  vi.useRealTimers();
});

const setVisible = (visible: boolean) => {
  visibility.mockReturnValue(visible ? "visible" : "hidden");
  document.dispatchEvent(new Event("visibilitychange"));
};

/** Loads a query, leaves the tab for `awayMs`, returns, waits `afterMs`, and reports how often it was fetched. */
async function fetchesAfterTrip(options: object, awayMs: number, afterMs: number) {
  const queryFn = vi.fn(async () => "data");
  const observer = new QueryObserver(client, { queryKey: ["day", Math.random()], queryFn, staleTime: 30_000, ...options });
  const unsubscribe = observer.subscribe(() => undefined);
  await vi.advanceTimersByTimeAsync(0); // the first load
  setVisible(false);
  await vi.advanceTimersByTimeAsync(awayMs);
  setVisible(true);
  await vi.advanceTimersByTimeAsync(afterMs);
  unsubscribe();
  return queryFn.mock.calls.length;
}

describe("coming back to the dashboard", () => {
  it("refreshes a live view even after a quick trip away", async () => {
    expect(await fetchesAfterTrip(liveQueryOptions, 5_000, REFOCUS_DELAY_MS + 50)).toBe(2);
  });

  it("leaves an ordinary view alone while its data is still fresh", async () => {
    expect(await fetchesAfterTrip({ refetchOnWindowFocus: true }, 5_000, REFOCUS_DELAY_MS + 50)).toBe(1);
  });

  it("refreshes an ordinary view after a long trip, as before", async () => {
    expect(await fetchesAfterTrip({ refetchOnWindowFocus: true }, 40_000, REFOCUS_DELAY_MS + 50)).toBe(2);
  });

  it("waits for the extension's upload: not at the instant of return, but once the delay has passed", async () => {
    expect(await fetchesAfterTrip(liveQueryOptions, 5_000, REFOCUS_DELAY_MS - 100)).toBe(1);
    expect(await fetchesAfterTrip(liveQueryOptions, 5_000, REFOCUS_DELAY_MS + 50)).toBe(2);
  });
});

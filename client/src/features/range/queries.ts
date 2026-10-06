import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/api";
import { liveQueryOptions } from "@/lib/queryClient";
import { periodBounds } from "@/lib/period";
import type { RangeSummary, RangeViewName } from "./types";

/**
 * Everything a Week or Month view shows, from one request. Any date inside the period asks for the same data, so
 * the cache is keyed by the period's first day. The previous period stays on screen while the next one loads,
 * and a period still in progress refreshes every minute while the tab is visible.
 */
export function useRangeSummary(view: RangeViewName, date: string, inProgress: boolean) {
  const { start } = periodBounds({ view, date });
  return useQuery({
    queryKey: ["range", view, start],
    queryFn: async () => (await api.get<RangeSummary>("/range", { params: { view, date } })).data,
    placeholderData: keepPreviousData,
    ...(inProgress ? liveQueryOptions : {}),
  });
}

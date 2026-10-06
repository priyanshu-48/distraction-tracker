import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/api";
import { liveQueryOptions } from "@/lib/queryClient";
import type { DaySummary } from "./types";

/**
 * Everything the Day view shows, from one request. The previous day stays on screen while the next one loads,
 * and today refreshes itself every minute while the tab is visible (a past day cannot change).
 */
export function useDaySummary(date: string, isToday: boolean) {
  return useQuery({
    queryKey: ["summary", date],
    queryFn: async () => (await api.get<DaySummary>("/summary", { params: { date } })).data,
    placeholderData: keepPreviousData,
    ...(isToday ? liveQueryOptions : {}),
  });
}

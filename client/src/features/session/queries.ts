import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api";
import { notifyTrackingChanged } from "@/lib/extension";
import { liveQueryOptions } from "@/lib/queryClient";

const SESSION_KEY = ["session"] as const;

/** Whether this account has a tracking session running. */
export function useSessionState() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => (await api.get<{ isTracking: boolean }>("/is-tracking")).data.isTracking,
    ...liveQueryOptions,
  });
}

/**
 * Starts or stops the session, then tells the extension at once so Stop ends the visit in progress and Start begins
 * following the tab. If it is not listening it notices within its next check, and the server cuts any overrun
 * (decisions.md, D-23).
 */
export function useToggleSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (start: boolean) => api.post(start ? "/start-tracking" : "/stop-tracking", {}),
    onSuccess: (_response, start) => {
      queryClient.setQueryData(SESSION_KEY, start);
      void notifyTrackingChanged(); // not awaited: the button must not wait on the extension
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });
}

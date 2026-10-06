import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api";
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

/** Starts or stops the session. The extension notices within its next check (see decisions.md, D-23). */
export function useToggleSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (start: boolean) => api.post(start ? "/start-tracking" : "/stop-tracking", {}),
    onSuccess: (_response, start) => queryClient.setQueryData(SESSION_KEY, start),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });
}

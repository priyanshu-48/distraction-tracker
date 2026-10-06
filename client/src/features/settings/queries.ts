import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api";

const BUDGET_KEY = ["budget"] as const;

interface SettingsResponse {
  dailyBudgetSeconds: number;
}

export function useBudget() {
  return useQuery({
    queryKey: BUDGET_KEY,
    queryFn: async () => (await api.get<SettingsResponse>("/settings")).data.dailyBudgetSeconds,
  });
}

/** Saves the daily budget, then refreshes every day shown so the ring uses the new number. */
export function useSaveBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dailyBudgetSeconds: number) =>
      (await api.put<SettingsResponse>("/settings", { dailyBudgetSeconds })).data.dailyBudgetSeconds,
    onSuccess: (seconds) => {
      queryClient.setQueryData(BUDGET_KEY, seconds);
      return Promise.all([queryClient.invalidateQueries({ queryKey: ["summary"] }), queryClient.invalidateQueries({ queryKey: ["range"] })]);
    },
  });
}

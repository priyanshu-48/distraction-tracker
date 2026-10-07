import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api";

const KEY = ["notification-settings"] as const;

export interface NotificationSettings {
  enabled: boolean;
  timeZone: string;
  /** Whether this server is connected to a notification service at all. When it is not, there is nothing to switch on. */
  available: boolean;
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<NotificationSettings>("/notifications/settings")).data,
  });
}

/** Saves the choice together with the browser's time zone, so "today" for an alert is the user's own day. */
export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      (
        await api.put<NotificationSettings>("/notifications/settings", {
          enabled,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
      ).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(KEY, saved);
    },
  });
}

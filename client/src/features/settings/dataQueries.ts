import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/api";
import { logout } from "@/app/auth";
import { notifyTrackingChanged } from "@/lib/extension";
import { todayIn } from "@/lib/period";

export type ExportFormat = "json" | "csv";

/** Fetches the export with the login token (a plain link could not send it) and hands it to the browser as a download. */
export async function downloadExport(format: ExportFormat): Promise<void> {
  const { data } = await api.get<Blob>("/account/export", { params: { format }, responseType: "blob" });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `distraction-tracker-${todayIn()}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useDownloadExport() {
  return useMutation({ mutationFn: downloadExport });
}

/** Deletes every recorded visit and session after the password is confirmed; the account, budget and marked sites stay. */
export function useDeleteHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (password: string) =>
      (await api.delete<{ visits: number; sessions: number }>("/account/data", { data: { password } })).data,
    onSuccess: () => {
      // Every screen is now out of date, and a session that was running is gone: tell the extension to look again.
      void notifyTrackingChanged();
      return queryClient.invalidateQueries();
    },
  });
}

/** Deletes the account after the password is confirmed, then signs out and goes to the sign-in page. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (password: string) => void (await api.delete("/account", { data: { password } })),
    onSuccess: async () => {
      await logout(queryClient, { serverSide: false }); // the account is gone, and the server cleared the cookie
      navigate("/login", { replace: true });
    },
  });
}

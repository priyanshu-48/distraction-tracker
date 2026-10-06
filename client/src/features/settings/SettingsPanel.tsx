import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { getToken } from "@/app/auth";
import { syncToken } from "@/lib/extension";
import { ExtensionCard } from "@/features/setup/ExtensionCard";
import { useExtensionState } from "@/features/setup/useSetupStatus";

/** Settings panel. The daily budget, time zone and data controls are added in Phase 5. */
export default function SettingsPanel() {
  const extension = useExtensionState();
  const needsReconnect = extension.data?.kind === "connected" && !(extension.data.report.hasToken && extension.data.report.authState === "ok");

  return (
    <div className="space-y-5">
      <ExtensionCard state={extension.data} />
      {needsReconnect ? (
        <Button
          variant="secondary"
          onClick={async () => {
            const token = getToken();
            if (token) await syncToken(token);
            await extension.refetch();
          }}
        >
          Reconnect extension
        </Button>
      ) : null}

      <Card>
        <CardTitle>Account</CardTitle>
        <p className="mt-2 mb-3 text-sm text-ink-muted">Logging out also tells the extension to stop recording as this account.</p>
        <LogoutButton />
      </Card>
    </div>
  );
}

import { Card } from "@/components/ui/card";
import { SetupChecklist } from "./SetupChecklist";
import { useSetupStatus } from "./useSetupStatus";

/**
 * Shown at the top of the dashboard until setup is done, then it disappears. If a user who already has
 * data loses the extension later, it comes back as a reconnect prompt instead of a first-run welcome.
 */
export function SetupBanner() {
  const status = useSetupStatus();
  if (!status.ready || status.complete) return null;

  const done = status.steps.filter((step) => step.status === "done").length;
  const title = status.returning ? "The extension isn't connected" : "Get started";
  return (
    <Card role="region" aria-label={title} className="mb-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-ink-muted">
          {done} of {status.steps.length} done
        </p>
      </div>
      <SetupChecklist status={status} />
    </Card>
  );
}

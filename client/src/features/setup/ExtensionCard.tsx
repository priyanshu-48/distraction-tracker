import { Card, CardTitle } from "@/components/ui/card";
import type { ExtensionState } from "@/lib/extension";
import { formatAgo } from "@/lib/format";

/** What the extension reports about itself. Shown in the Settings panel. */
export function ExtensionCard({ state }: { state: ExtensionState | undefined }) {
  const report = state?.kind === "connected" ? state.report : null;
  return (
    <Card>
      <CardTitle>Extension</CardTitle>
      {report ? (
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-ink-muted">Version</dt>
          <dd>{report.version}</dd>
          <dt className="text-ink-muted">Account</dt>
          <dd>{report.hasToken && report.authState === "ok" ? "Connected" : report.authState === "logged_out" ? "Signed out" : "Not connected"}</dd>
          <dt className="text-ink-muted">Recording</dt>
          <dd>{report.tracking ? "On" : "Off"}</dd>
          <dt className="text-ink-muted">Waiting to upload</dt>
          <dd>
            {report.queued} {report.queued === 1 ? "visit" : "visits"}
          </dd>
          <dt className="text-ink-muted">Last upload</dt>
          <dd>{formatAgo(report.lastUploadAt)}</dd>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          {!state
            ? "Looking for the extension…"
            : state.kind === "outdated"
              ? "Installed, but an older version that cannot report its status. Reload it on chrome://extensions."
              : "Not detected in this browser."}
        </p>
      )}
    </Card>
  );
}

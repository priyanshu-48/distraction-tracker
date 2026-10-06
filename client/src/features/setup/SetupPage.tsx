import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getToken } from "@/app/auth";
import { checkExtension, syncToken, type ExtensionState } from "@/lib/extension";
import { formatAgo } from "@/lib/format";
import { SessionControl } from "@/features/session/SessionControl";
import { useSessionState, useToggleSession } from "@/features/session/queries";
import { useSites } from "@/features/sites/queries";
import { computeSteps, isSetupComplete, type SetupStep } from "./steps";

const POLL_MS = 3000; // a local message to the extension, cheap enough to keep the ticks live

function useExtension() {
  return useQuery({ queryKey: ["extension"], queryFn: checkExtension, refetchInterval: POLL_MS });
}

/** What to do about the extension, depending on why it is not answering. */
function InstallHelp({ state }: { state: ExtensionState | undefined }) {
  if (!state) return <p className="text-sm text-ink-muted">Looking for the extension…</p>;
  switch (state.kind) {
    case "unconfigured":
      return (
        <p className="text-sm text-ink-muted">
          Set <code className="rounded bg-raised px-1">VITE_EXTENSION_ID</code> in <code className="rounded bg-raised px-1">client/.env</code> to
          the extension's ID (shown on its card at <code className="rounded bg-raised px-1">chrome://extensions</code>) and restart the dev server.
        </p>
      );
    case "unsupported":
      return <p className="text-sm text-ink-muted">This browser cannot talk to extensions. Open the dashboard in Chrome, Brave or Edge.</p>;
    case "not-found":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          <li>Open <code className="rounded bg-raised px-1">chrome://extensions</code> and turn on Developer mode.</li>
          <li>Choose Load unpacked and pick the project's <code className="rounded bg-raised px-1">extension</code> folder.</li>
          <li>Check that its ID matches <code className="rounded bg-raised px-1">VITE_EXTENSION_ID</code>, and that it is enabled.</li>
        </ol>
      );
    default:
      return null;
  }
}

function StepIcon({ status }: { status: SetupStep["status"] }) {
  if (status === "done") return <CheckCircle2 aria-hidden="true" className="size-6 shrink-0 text-teal" />;
  if (status === "current") return <CircleDot aria-hidden="true" className="size-6 shrink-0 text-coral" />;
  return <Circle aria-hidden="true" className="size-6 shrink-0 text-ink-muted" />;
}

export default function SetupPage() {
  const extension = useExtension();
  const session = useSessionState();
  const toggleSession = useToggleSession();
  // Polled like the extension check so the last step ticks by itself once a visit is recorded.
  const visits = useSites({ days: 90, filter: "all", q: "", sort: "time", limit: 1, offset: 0 }, { refetchInterval: POLL_MS });

  const steps = computeSteps({
    extension: extension.data,
    tracking: session.data,
    hasVisits: visits.data ? visits.data.total > 0 : undefined,
  });
  const complete = isSetupComplete(steps);
  const report = extension.data?.kind === "connected" ? extension.data.report : null;

  async function connect() {
    const token = getToken();
    if (token) await syncToken(token);
    await extension.refetch();
  }

  const details: Record<SetupStep["id"], React.ReactNode> = {
    install: <InstallHelp state={extension.data} />,
    connect: (
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">
          {report?.authState === "logged_out"
            ? "The extension was signed out. Reconnect it to keep recording."
            : "The extension needs your login to upload visits."}
        </p>
        <Button size="sm" variant="secondary" onClick={connect}>
          Connect extension
        </Button>
      </div>
    ),
    session: (
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">Only time while a session is running is recorded.</p>
        <Button size="sm" onClick={() => toggleSession.mutate(true)} disabled={toggleSession.isPending}>
          Start session
        </Button>
      </div>
    ),
    browse: <p className="text-sm text-ink-muted">Open a few sites in other tabs. Your visits appear here within a minute.</p>,
  };

  return (
    <AppShell title="Get started" actions={<SessionControl />}>
      <div className="mx-auto max-w-2xl space-y-5">
        <p className="text-ink-muted">Four steps until your first numbers show up. This page updates as each one is done.</p>

        <Card>
          <ol className="space-y-5" aria-live="polite">
            {steps.map((step) => (
              <li key={step.id} className="flex gap-3" aria-current={step.status === "current" ? "step" : undefined}>
                <StepIcon status={step.status} />
                <div className="min-w-0 flex-1">
                  <p className={step.status === "todo" ? "font-semibold text-ink-muted" : "font-semibold"}>
                    {step.title}
                    <span className="sr-only">{step.status === "done" ? " (done)" : step.status === "current" ? " (current step)" : " (not yet)"}</span>
                  </p>
                  {step.status === "current" ? <div className="mt-2">{details[step.id]}</div> : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {complete ? (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">You're set up.</p>
            <Button asChild>
              <Link to="/sites">See your sites</Link>
            </Button>
          </Card>
        ) : null}

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
              <dd>{report.queued} {report.queued === 1 ? "visit" : "visits"}</dd>
              <dt className="text-ink-muted">Last upload</dt>
              <dd>{formatAgo(report.lastUploadAt)}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Not detected in this browser.</p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

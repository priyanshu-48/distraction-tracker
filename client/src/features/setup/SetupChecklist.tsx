import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncExtension } from "@/app/auth";
import type { ExtensionState } from "@/lib/extension";
import { useToggleSession } from "@/features/session/queries";
import type { SetupStatus } from "./useSetupStatus";
import type { SetupStep } from "./steps";

const code = "rounded bg-raised px-1";

/** What to do about the extension, depending on why it is not answering. */
function InstallHelp({ state }: { state: ExtensionState | undefined }) {
  if (!state) return <p className="text-sm text-ink-muted">Looking for the extension…</p>;
  switch (state.kind) {
    case "unconfigured":
      return (
        <p className="text-sm text-ink-muted">
          Set <code className={code}>VITE_EXTENSION_ID</code> in <code className={code}>client/.env</code> to the extension's ID
          (shown on its card at <code className={code}>chrome://extensions</code>) and restart the dev server.
        </p>
      );
    case "unsupported":
      return <p className="text-sm text-ink-muted">This browser cannot talk to extensions. Open the dashboard in Chrome, Brave or Edge.</p>;
    case "outdated":
      return (
        <p className="text-sm text-ink-muted">
          The extension is installed but is an older version that cannot report its status. Open{" "}
          <code className={code}>chrome://extensions</code> and press the reload button on it.
        </p>
      );
    case "not-found":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          <li>Open <code className={code}>chrome://extensions</code> and turn on Developer mode.</li>
          <li>Choose Load unpacked and pick the project's <code className={code}>extension</code> folder.</li>
          <li>Check that its ID matches <code className={code}>VITE_EXTENSION_ID</code>, and that it is enabled.</li>
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

/** The four setup steps with live ticks; only the current step shows what to do. */
export function SetupChecklist({ status }: { status: SetupStatus }) {
  const toggleSession = useToggleSession();
  const report = status.extension.data?.kind === "connected" ? status.extension.data.report : null;

  async function connect() {
    await syncExtension();
    await status.refetchExtension();
  }

  const details: Record<SetupStep["id"], React.ReactNode> = {
    install: <InstallHelp state={status.extension.data} />,
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
    <ol className="space-y-4" aria-live="polite">
      {status.steps.map((step) => (
        <li key={step.id} className="flex gap-3" aria-current={step.status === "current" ? "step" : undefined}>
          <StepIcon status={step.status} />
          <div className="min-w-0 flex-1">
            <p className={step.status === "todo" ? "font-semibold text-ink-muted" : "font-semibold"}>
              {step.title}
              <span className="sr-only">
                {step.status === "done" ? " (done)" : step.status === "current" ? " (current step)" : " (not yet)"}
              </span>
            </p>
            {step.status === "current" ? <div className="mt-2">{details[step.id]}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

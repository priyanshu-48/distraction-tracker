import type { ExtensionState } from "@/lib/extension";

export type StepId = "install" | "connect" | "session" | "browse";
export type StepStatus = "done" | "current" | "todo";

export interface SetupStep {
  id: StepId;
  title: string;
  status: StepStatus;
}

export interface SetupInputs {
  /** Undefined while the first answer is still loading; treated as "not yet". */
  extension: ExtensionState | undefined;
  tracking: boolean | undefined;
  /** Has any visit been recorded for this account? */
  hasVisits: boolean | undefined;
}

/**
 * The first-run checklist. A step is done when the thing it describes is true right now; the first step
 * that is not done is the "current" one. Recorded visits count as proof a session was started.
 */
export function computeSteps({ extension, tracking, hasVisits }: SetupInputs): SetupStep[] {
  const installed = extension?.kind === "connected";
  const connected = extension?.kind === "connected" && extension.report.hasToken && extension.report.authState === "ok";

  const done: Record<StepId, boolean> = {
    install: installed,
    connect: connected,
    session: tracking === true || hasVisits === true,
    browse: hasVisits === true,
  };
  const titles: Record<StepId, string> = {
    install: "Install the extension",
    connect: "Connect it to your account",
    session: "Start a session",
    browse: "Browse for a minute",
  };

  let currentTaken = false;
  return (Object.keys(titles) as StepId[]).map((id) => {
    if (done[id]) return { id, title: titles[id], status: "done" as const };
    const status = currentTaken ? ("todo" as const) : ("current" as const);
    currentTaken = true;
    return { id, title: titles[id], status };
  });
}

export const isSetupComplete = (steps: SetupStep[]) => steps.every((step) => step.status === "done");

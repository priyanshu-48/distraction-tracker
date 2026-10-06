import { useQuery } from "@tanstack/react-query";
import { checkExtension } from "@/lib/extension";
import { useSessionState } from "@/features/session/queries";
import { useSites } from "@/features/sites/queries";
import { computeSteps, isSetupComplete } from "./steps";

const FAST_MS = 3000; // while something still needs doing, so the ticks feel live
const SLOW_MS = 30_000; // once connected, just notice if it later stops

/** The extension's own report. Polled quickly until it is connected, slowly afterwards. */
export function useExtensionState() {
  return useQuery({
    queryKey: ["extension"],
    queryFn: checkExtension,
    refetchInterval: (query) => {
      const state = query.state.data;
      return state?.kind === "connected" && state.report.hasToken ? SLOW_MS : FAST_MS;
    },
  });
}

/** Everything the setup banner, the header dot and the settings panel need to know. */
export function useSetupStatus() {
  const extension = useExtensionState();
  const session = useSessionState();
  // Once any visit exists the history is not going away, so stop polling for it.
  const visits = useSites(
    { days: 90, filter: "all", q: "", sort: "time", limit: 1, offset: 0 },
    { refetchInterval: (query) => ((query.state.data?.total ?? 0) > 0 ? false : FAST_MS) }
  );

  const steps = computeSteps({
    extension: extension.data,
    tracking: session.data,
    hasVisits: visits.data ? visits.data.total > 0 : undefined,
  });

  return {
    extension,
    session,
    steps,
    complete: isSetupComplete(steps),
    /** False until the first answers are in, so nothing flashes on and off while loading. */
    ready: extension.data !== undefined && visits.data !== undefined,
    /** Had visits before: this is a reconnect, not a first run. */
    returning: (visits.data?.total ?? 0) > 0,
    refetchExtension: () => extension.refetch(),
  };
}

export type SetupStatus = ReturnType<typeof useSetupStatus>;

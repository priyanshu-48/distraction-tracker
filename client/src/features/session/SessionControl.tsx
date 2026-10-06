import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionState, useToggleSession } from "./queries";

/** The one action taken every day: start or stop tracking. Shown in the header of every screen. */
export function SessionControl() {
  const session = useSessionState();
  const toggle = useToggleSession();
  const tracking = session.data === true;

  if (session.isPending) return <div className="h-11 w-36 animate-pulse rounded-xl bg-card motion-reduce:animate-none" aria-hidden="true" />;

  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2 text-sm text-ink-muted max-sm:sr-only" role="status">
        <span aria-hidden="true" className={`size-2 rounded-full ${tracking ? "bg-teal" : "bg-raised"}`} />
        {tracking ? "Tracking" : "Not tracking"}
      </span>
      <Button
        variant={tracking ? "secondary" : "primary"}
        onClick={() => toggle.mutate(!tracking)}
        disabled={toggle.isPending}
      >
        {tracking ? <Square aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
        {tracking ? "Stop session" : "Start session"}
      </Button>
    </div>
  );
}

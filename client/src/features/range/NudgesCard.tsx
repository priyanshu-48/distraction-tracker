import { Card, CardTitle } from "@/components/ui/card";
import type { RangeSummary } from "./types";

const muted = "text-sm text-ink-muted";
const percent = (part: number, of: number) => `${Math.round((100 * part) / of)}%`;

/**
 * How the nudges did in this period (decisions.md, D-48): how many were shown, how often you left that site within a minute,
 * and, once there are enough of each, how that compares with the visits where a nudge was deliberately held back. It says what
 * was measured and no more: leaving sooner is not proof the nudge caused it, which is why the comparison exists at all.
 * Hidden when no nudges were decided in the period, so someone who never switched them on sees nothing new.
 */
export function NudgesCard({ nudges }: { nudges: RangeSummary["nudges"] }) {
  if (!nudges) return null;
  const { nudged, shown, shownLeft, heldOut, heldOutLeft, comparable } = nudges;

  return (
    <Card>
      <CardTitle>Nudges</CardTitle>
      <p className="mt-2 text-2xl font-semibold text-ink">
        {nudged} {nudged === 1 ? "nudge" : "nudges"}
      </p>
      {shown === 0 ? (
        <p className={`${muted} mt-1`}>The visits you were nudged on have not been recorded yet.</p>
      ) : (
        <p className={`${muted} mt-1`}>
          You left within a minute {shownLeft} of {shown} times ({percent(shownLeft, shown)}).
        </p>
      )}
      {comparable ? (
        <p className={`${muted} mt-2`}>
          With a nudge you left within a minute {percent(shownLeft, shown)} of the time; when one was held back on purpose,{" "}
          {percent(heldOutLeft, heldOut)} ({heldOutLeft} of {heldOut}).
        </p>
      ) : (
        <p className={`${muted} mt-2`}>
          Not enough to compare yet: it needs at least 5 visits with a nudge and 5 where one was held back on purpose.
        </p>
      )}
    </Card>
  );
}

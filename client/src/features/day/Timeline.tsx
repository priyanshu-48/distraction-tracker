import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import { siteInfo } from "@/lib/siteInfo";
import { buildTimelineModel, clockTime, listSessions } from "./timelineModel";
import type { DaySummary } from "./types";

interface TimelineProps {
  timeline: DaySummary["timeline"];
  timeZone: string;
  isToday: boolean;
  /** When the data was fetched; a running session is drawn up to this moment. */
  nowMs: number;
  /** The site whose spans are lit (hovered or picked in the list); the rest of the distractions fade. */
  active: string | null;
  onHover: (domain: string | null) => void;
  onPick: (domain: string) => void;
}

/**
 * When the day happened on one axis: a faint band for each tracking session, grey bars for other time, and tall
 * coral bars for distractions. Picking a site in the list lights up its bursts here, and the other way round.
 * The session list under the chart is the text version of all of it.
 */
export function Timeline({ timeline, timeZone, isToday, nowMs, active, onHover, onPick }: TimelineProps) {
  const [fullDay, setFullDay] = useState(false);
  const model = buildTimelineModel(timeline, { timeZone, isToday, nowMs, fullDay });
  const sessions = listSessions(timeline.sessions, timeZone, nowMs, isToday);
  const pct = (fraction: number) => `${fraction * 100}%`;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardTitle>When</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setFullDay(!fullDay)}>
          {fullDay ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          {fullDay ? "Show active hours" : "Show full day"}
        </Button>
      </div>

      <div className="mt-4" aria-hidden="true">
        <div className="relative h-14">
          {model.breaks.map((gap, index) => (
            <div
              key={`break-${index}`}
              className="absolute inset-y-0 border-l border-dashed border-ink-muted/60"
              style={{ left: pct(gap.left + gap.width / 2) }}
              title="Nothing was tracked here"
            />
          ))}
          {model.sessions.map((band, index) => (
            <div key={index} className="absolute inset-y-0 rounded-md bg-raised/60" style={{ left: pct(band.left), width: pct(band.width) }} />
          ))}
          {model.spans.map((span, index) => {
            const style = { left: pct(span.left), width: pct(span.width) };
            if (span.kind === "other") {
              return <div key={index} className="absolute inset-y-[28%] rounded-sm bg-ink-muted/60" style={style} />;
            }
            const dimmed = active !== null && span.domain !== active;
            const lit = active !== null && span.domain === active;
            return (
              <div
                key={index}
                className={`absolute inset-y-0 cursor-pointer rounded-sm bg-coral transition-opacity motion-reduce:transition-none ${dimmed ? "opacity-25" : ""} ${lit ? "outline-2 outline-ink" : ""}`}
                style={style}
                title={`${span.domain ? siteInfo(span.domain).name : "Distractions"} · ${span.visits} ${span.visits === 1 ? "visit" : "visits"} · ${formatDuration(span.seconds)} · ${clockTime(span.start, timeZone)} to ${clockTime(span.end, timeZone)}`}
                onMouseEnter={() => onHover(span.domain)}
                onMouseLeave={() => onHover(null)}
                onClick={() => span.domain && onPick(span.domain)}
              />
            );
          })}
        </div>
        <div className="relative mt-1 h-4 text-xs text-ink-muted">
          {model.ticks.map((tick) => (
            <span
              key={`${tick.left}-${tick.label}`}
              className="absolute"
              style={{ left: pct(tick.left), transform: tick.align === "start" ? "none" : tick.align === "end" ? "translateX(-100%)" : "translateX(-50%)" }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted" aria-hidden="true">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-coral" /> Distraction
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-ink-muted/60" /> Other
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-raised" /> Tracking
        </span>
      </div>

      {timeline.sessions.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm">
          {sessions.lines.map((line) => (
            <li key={line.key}>{line.text}</li>
          ))}
          {sessions.hidden > 0 ? (
            <li className="text-ink-muted">
              {sessions.lines.length > 0 ? "+ " : ""}
              {sessions.hidden} very short {sessions.hidden === 1 ? "session" : "sessions"}
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">No tracking session was recorded; the bars show the visits on their own.</p>
      )}
    </Card>
  );
}

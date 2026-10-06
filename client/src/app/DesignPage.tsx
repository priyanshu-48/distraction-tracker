import { useState } from "react";
import { Inbox, Play } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { contrastRatio } from "@/lib/color";
import { formatDuration } from "@/lib/format";

const CARD = "#28293b";
const swatches = [
  { name: "page", hex: "#101123", note: "background" },
  { name: "card", hex: "#28293b", note: "cards" },
  { name: "raised", hex: "#404251", note: "borders, tracks, selected" },
  { name: "ink", hex: "#fcffff", note: "text" },
  { name: "ink-muted", hex: "#9b9cae", note: "secondary text (cards and page only)" },
  { name: "coral", hex: "#ff7c50", note: "primary action, distraction, budget" },
  { name: "teal", hex: "#47d1dc", note: "other time, focus ring" },
  { name: "purple", hex: "#be78ce", note: "site segment" },
  { name: "green", hex: "#6ad591", note: "site segment" },
  { name: "pink", hex: "#e286c9", note: "site segment" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-sm font-semibold tracking-wider text-ink-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** Development-only gallery: check the look, contrast and states before building real screens. */
export default function DesignPage() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("7d");
  const [track, setTrack] = useState(true);

  return (
    <AppShell
      title="Design system"
      actions={
        <Button>
          <Play aria-hidden="true" className="size-4" /> Start session
        </Button>
      }
    >
      <Section title="Colour (contrast of each colour as text on a card)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {swatches.map(({ name, hex, note }) => {
            const ratio = contrastRatio(hex, CARD);
            return (
              <Card key={name} className="p-3">
                <div className="h-14 rounded-lg border border-raised" style={{ background: hex }} />
                <p className="mt-2 text-sm font-semibold">{name}</p>
                <p className="text-xs text-ink-muted">{hex}</p>
                <p className="text-xs text-ink-muted">{note}</p>
                <p className="mt-1 text-xs">
                  {ratio.toFixed(2)}:1 {ratio >= 4.5 ? "passes" : "decorative only"}
                </p>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="Numbers and duration formatting">
        <Card>
          <CardTitle>Distracted today</CardTitle>
          <p className="mt-2 text-5xl font-semibold tracking-tight">{formatDuration(4320)}</p>
          <p className="text-ink-muted">of 2h budget · {formatDuration(2880)} left</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            {[0, 45, 750, 4320, 7200, 93600].map((seconds) => (
              <div key={seconds} className="flex justify-between gap-3">
                <dt className="text-ink-muted">{seconds}s</dt>
                <dd>{formatDuration(seconds)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </Section>

      <Section title="Stat tiles and badges">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Visits" value="38" hint="avg 1m 54s" />
          <StatTile label="Longest focus" value="47m" hint="best this week: 1h 2m" />
          <StatTile label="First distraction" value="11m" hint="after session start" />
          <StatTile label="Switches / hour" value="14" hint="3 fewer than yesterday" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="coral">binge</Badge>
          <Badge tone="purple">checking habit</Badge>
          <Badge tone="teal">other time</Badge>
          <Badge tone="green">under budget</Badge>
          <Badge tone="pink">new</Badge>
          <Badge>unmarked</Badge>
        </div>
      </Section>

      <Section title="Controls">
        <Card className="flex flex-wrap items-center gap-4">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Tooltip content="Tooltips open on hover and on keyboard focus">
            <Button variant="secondary" size="sm">
              Hover or focus me
            </Button>
          </Tooltip>
          <Segmented
            label="Range"
            value={range}
            onValueChange={setRange}
            options={[
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "90d", label: "90d" },
            ]}
          />
          <div className="flex items-center gap-3">
            <Switch id="mark" checked={track} onCheckedChange={setTrack} />
            <label htmlFor="mark" className="text-sm">
              Count as a distraction
            </label>
          </div>
        </Card>
      </Section>

      <Section title="Loading, empty and error states">
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="space-y-3" aria-busy="true">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </Card>
          <EmptyState
            icon={<Inbox aria-hidden="true" />}
            title="Nothing tracked yet"
            description="Start a session and browse; your first visits appear here."
            action={<Button size="sm">Start session</Button>}
          />
          <ErrorState onRetry={() => undefined} />
        </div>
      </Section>
    </AppShell>
  );
}

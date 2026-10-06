import * as React from "react";
import { Card, CardTitle } from "./card";

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

/** A label, one big number and an optional line of context. */
export function StatTile({ label, value, hint, className }: StatTileProps) {
  return (
    <Card className={className}>
      <CardTitle>{label}</CardTitle>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
    </Card>
  );
}

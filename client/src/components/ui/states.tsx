import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { Card } from "./card";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

/** Nothing to show yet; say what to do next instead of rendering an empty chart. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      {icon ? <div className="text-teal">{icon}</div> : null}
      <p className="text-lg font-semibold">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
}

/** A widget failed to load. Announced to screen readers; one failure never blanks the page. */
export function ErrorState({
  title = "Couldn't load this",
  description = "Check your connection and try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <Card role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
      <AlertTriangle className="text-coral" aria-hidden="true" />
      <p className="text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Card>
  );
}

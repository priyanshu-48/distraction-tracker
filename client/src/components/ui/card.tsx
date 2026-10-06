import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-(--radius-card) bg-card p-5", className)} {...props} />;
}

/** Small uppercase section label, like "TOP SITES TODAY". */
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-xs font-semibold tracking-wider text-ink-muted uppercase", className)}
      {...props}
    />
  );
}

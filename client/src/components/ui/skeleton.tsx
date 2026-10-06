import * as React from "react";
import { cn } from "@/lib/utils";

/** Loading placeholder. Size it to match the content it stands in for so the layout does not jump. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-raised motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

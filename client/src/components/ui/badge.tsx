import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    tone: {
      coral: "bg-coral/15 text-coral",
      teal: "bg-teal/15 text-teal",
      purple: "bg-purple/15 text-purple",
      green: "bg-green/15 text-green",
      pink: "bg-pink/15 text-pink",
      muted: "bg-raised text-ink",
    },
  },
  defaultVariants: { tone: "muted" },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

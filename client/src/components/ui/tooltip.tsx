import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export const TooltipProvider = TooltipPrimitive.Provider;

/** Shows `content` on hover and on keyboard focus of its child. */
export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactElement }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="app-dark z-50 rounded-lg bg-raised px-3 py-1.5 text-sm text-ink shadow-lg"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/** Toggle with a built-in role and keyboard support. Pair it with a visible <label htmlFor>. */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-raised p-1 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal",
        "data-[state=checked]:bg-coral disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-ink transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-coral-ink" />
    </SwitchPrimitive.Root>
  );
}

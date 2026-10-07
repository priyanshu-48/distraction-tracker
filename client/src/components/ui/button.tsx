import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-colors " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Dark text on coral: white would only reach 2.53:1.
        primary: "bg-coral text-coral-ink hover:bg-coral/90",
        secondary: "bg-raised text-ink hover:bg-raised/80",
        ghost: "text-ink hover:bg-raised/60",
        // For actions that delete: outlined, so it never looks like the main button.
        danger: "border border-coral text-coral hover:bg-coral/10",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">, // includes `ref`, which React 19 passes as an ordinary prop
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "./button";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

/**
 * A panel that slides in from the right over the page. Built on Radix Dialog, so it traps focus, closes on
 * Escape or a click outside, locks page scroll, returns focus to what opened it and is announced as a dialog.
 * Content is only mounted while open, so anything inside it loads data only when the panel is shown.
 */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  // Radix returns focus only to its own <Trigger>. These panels are opened from the URL by ordinary buttons,
  // so remember what had focus at the moment of opening (a layout effect runs before Radix moves focus into
  // the panel) and give it back on close. Without this, keyboard users land at the top of the page.
  const opener = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        {/* The portal sits outside the page wrapper, so the theme class is repeated here. */}
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="app-dark fixed inset-y-0 right-0 z-50 w-full max-w-3xl animate-[sheet-in_180ms_ease-out] overflow-y-auto bg-page p-4 shadow-2xl motion-reduce:animate-none sm:p-6"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <Dialog.Title className="text-xl font-semibold tracking-tight">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X aria-hidden="true" className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

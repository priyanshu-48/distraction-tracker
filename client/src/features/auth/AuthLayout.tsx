import * as React from "react";
import { Card } from "@/components/ui/card";

interface AuthLayoutProps {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

/** Centered card used by the sign-in and register screens. */
export function AuthLayout({ title, children, footer }: AuthLayoutProps) {
  return (
    <div className="app-dark grid min-h-dvh place-items-center px-4 py-10">
      <main className="w-full max-w-md">
        <p className="mb-6 text-center text-lg font-bold tracking-tight">Distraction Tracker</p>
        <Card className="p-6 sm:p-8">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </Card>
        <p className="mt-6 text-center text-sm text-ink-muted">{footer}</p>
      </main>
    </div>
  );
}

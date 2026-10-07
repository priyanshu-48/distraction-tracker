import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { errorMessage } from "@/app/auth";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/components/ui/field";
import { useDeleteAccount, useDeleteHistory, useDownloadExport, type ExportFormat } from "./dataQueries";

interface ConfirmProps {
  /** Say what will happen, in full: this cannot be undone. */
  description: string;
  confirmLabel: string;
  onConfirm: (password: string) => Promise<unknown>;
  onCancel: () => void;
}

/** Asks for the password before anything is deleted; a wrong password says so and leaves the form open. */
function ConfirmDelete({ description, confirmLabel, onConfirm, onCancel }: ConfirmProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password) return setError("Enter your password to confirm.");
    setError(null);
    setPending(true);
    try {
      await onConfirm(password);
    } catch (failure) {
      setError(errorMessage(failure, "Couldn't delete. Please try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-raised/50 p-4" noValidate>
      <p className="text-sm">{description}</p>
      <PasswordField
        id={`confirm-${confirmLabel.replace(/\s+/g, "-").toLowerCase()}`}
        label="Your password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={error}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Deleting…" : confirmLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type Open = "history" | "account" | null;

/** Download a copy of everything, or delete it: the history, or the whole account. */
export function DataCard() {
  const download = useDownloadExport();
  const deleteHistory = useDeleteHistory();
  const deleteAccount = useDeleteAccount();
  const [open, setOpen] = useState<Open>(null);
  const [deleted, setDeleted] = useState<{ visits: number; sessions: number } | null>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const closedFrom = useRef<Open>(null);

  // Cancelling or finishing returns focus to the button that opened the form.
  useEffect(() => {
    if (open === null && closedFrom.current) (closedFrom.current === "history" ? historyTrigger : accountTrigger).current?.focus();
  }, [open]);

  const close = () => {
    closedFrom.current = open;
    setOpen(null);
  };
  const choose = (target: Exclude<Open, null>) => {
    setDeleted(null);
    closedFrom.current = null;
    setOpen(target);
  };

  const downloading = (format: ExportFormat) => download.isPending && download.variables === format;

  return (
    <Card>
      <CardTitle>Your data</CardTitle>
      <p className="mt-1 mb-3 text-sm text-ink-muted">Everything is stored in your own database. Download a copy of it, or delete it.</p>

      <div className="flex flex-wrap gap-2">
        {(["json", "csv"] as const).map((format) => (
          <Button key={format} variant="secondary" size="sm" disabled={download.isPending} onClick={() => download.mutate(format)}>
            <Download aria-hidden="true" className="size-4" />
            {downloading(format) ? "Preparing…" : format === "json" ? "Everything (JSON)" : "Visits (CSV)"}
          </Button>
        ))}
      </div>
      {download.isError ? (
        <p role="alert" className="mt-2 text-sm text-coral">
          {errorMessage(download.error, "Couldn't prepare the download. Please try again.")}
        </p>
      ) : null}

      <div className="mt-5 border-t border-raised pt-4">
        <CardTitle>Delete</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button ref={historyTrigger} variant="danger" size="sm" aria-expanded={open === "history"} onClick={() => choose("history")}>
            Delete my history…
          </Button>
          <Button ref={accountTrigger} variant="danger" size="sm" aria-expanded={open === "account"} onClick={() => choose("account")}>
            Delete my account…
          </Button>
        </div>

        {open === "history" ? (
          <ConfirmDelete
            description="This permanently deletes every recorded visit and tracking session, and cannot be undone. Your account, daily budget and list of distraction sites stay."
            confirmLabel="Delete history"
            onCancel={close}
            onConfirm={async (password) => {
              setDeleted(await deleteHistory.mutateAsync(password));
              close();
            }}
          />
        ) : null}
        {open === "account" ? (
          <ConfirmDelete
            description="This permanently deletes your account and everything in it, and cannot be undone. You will be signed out."
            confirmLabel="Delete account"
            onCancel={close}
            onConfirm={(password) => deleteAccount.mutateAsync(password)}
          />
        ) : null}

        {deleted ? (
          <p role="status" className="mt-3 text-sm text-teal">
            Deleted {deleted.visits} {deleted.visits === 1 ? "visit" : "visits"} and {deleted.sessions}{" "}
            {deleted.sessions === 1 ? "session" : "sessions"}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

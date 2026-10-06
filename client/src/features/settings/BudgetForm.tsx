import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { useBudget, useSaveBudget } from "./queries";

// Same range as the server and the database: 5 minutes to 24 hours.
const MIN_MINUTES = 5;
const MAX_MINUTES = 24 * 60;

/** How long a day of distractions may last before the ring is full. */
export function BudgetForm() {
  const budget = useBudget();
  const save = useSaveBudget();
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Show the saved value once it arrives (and again after a save).
  useEffect(() => {
    if (budget.data !== undefined) setMinutes(String(budget.data / 60));
  }, [budget.data]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < MIN_MINUTES || value > MAX_MINUTES) {
      setError(`Enter a whole number of minutes from ${MIN_MINUTES} to ${MAX_MINUTES}.`);
      return;
    }
    setError(null);
    save.mutate(value * 60);
  }

  return (
    <Card>
      <CardTitle>Daily distraction budget</CardTitle>
      <p className="mt-1 mb-3 text-sm text-ink-muted">The most time you want to spend on sites you marked, in one day.</p>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
        <div className="flex-1">
          <TextField
            id="budget-minutes"
            label="Minutes per day"
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={5}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            error={error ?? (save.isError ? "Couldn't save. Please try again." : null)}
            disabled={budget.isPending}
          />
        </div>
        <Button type="submit" disabled={save.isPending || budget.isPending} className="sm:mt-7">
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
      {save.isSuccess && !error ? (
        <p role="status" className="mt-2 text-sm text-teal">
          Saved.
        </p>
      ) : null}
    </Card>
  );
}

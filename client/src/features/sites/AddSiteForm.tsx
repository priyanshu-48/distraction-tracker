import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMarkSite } from "./queries";

/** Mark a site as a distraction before ever visiting it, e.g. "reddit.com". */
export function AddSiteForm() {
  const [domain, setDomain] = useState("");
  const markSite = useMarkSite();

  const failed = markSite.isError;
  const message = failed ? "Enter a site name like reddit.com" : null;

  return (
    <Card>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          const value = domain.trim();
          if (!value) return;
          markSite.mutate({ domain: value, marked: true }, { onSuccess: () => setDomain("") });
        }}
      >
        <div className="flex-1">
          <label htmlFor="add-site" className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
            Add a distraction
          </label>
          <input
            id="add-site"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="reddit.com"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={failed}
            aria-describedby={failed ? "add-site-error" : undefined}
            className="mt-1 h-11 w-full rounded-xl bg-raised px-4 text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-teal"
          />
          {message ? (
            <p id="add-site-error" role="alert" className="mt-1 text-sm text-coral">
              {message}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={markSite.isPending} className="sm:mt-5">
          <Plus aria-hidden="true" className="size-4" /> Mark as distraction
        </Button>
      </form>
    </Card>
  );
}

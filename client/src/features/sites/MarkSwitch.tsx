import { Switch } from "@/components/ui/switch";
import { useMarkSite } from "./queries";

/**
 * The "counts as a distraction" switch for one site, used wherever a site is listed. It shows the choice
 * straight away while the request is in flight and goes back if saving fails.
 */
export function MarkSwitch({ domain, marked, onChange }: { domain: string; marked: boolean; onChange?: (marked: boolean) => void }) {
  const mark = useMarkSite();
  const checked = mark.isPending ? mark.variables.marked : marked;
  const id = `mark-${domain}`;
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Count {domain} as a distraction
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(next) => {
          mark.mutate({ domain, marked: next });
          onChange?.(next);
        }}
      />
    </>
  );
}

import * as ToggleGroup from "@radix-ui/react-toggle-group";

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}

/** Pick one of a few options, e.g. 7d / 30d / 90d. Keyboard: arrow keys move, space selects. */
export function Segmented<T extends string>({ label, value, onValueChange, options }: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix reports "" when the active item is clicked again; a range must always stay selected.
      onValueChange={(next) => next && onValueChange(next as T)}
      aria-label={label}
      className="inline-flex rounded-xl bg-card p-1"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="h-9 min-w-12 rounded-lg px-3 text-sm font-semibold text-ink-muted transition-colors
            hover:text-ink focus-visible:outline-2 focus-visible:outline-teal
            data-[state=on]:bg-raised data-[state=on]:text-ink"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

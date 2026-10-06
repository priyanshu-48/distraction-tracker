import { useExtensionState } from "@/features/setup/useSetupStatus";

/**
 * A small header indicator of whether the extension is reachable and signed in. If it silently stops,
 * this is where the user notices (the failure in decisions.md, D-12). Opens the Settings panel.
 */
export function ConnectionDot({ onClick }: { onClick: () => void }) {
  const { data } = useExtensionState();
  if (!data) return null;

  const ok = data.kind === "connected" && data.report.hasToken && data.report.authState === "ok";
  const label = ok
    ? "Extension connected"
    : data.kind === "connected"
      ? "Extension needs reconnecting"
      : data.kind === "outdated"
        ? "Extension needs a reload"
        : "Extension not detected";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}. Open settings.`}
      className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm text-ink-muted hover:bg-raised/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
    >
      <span aria-hidden="true" className={`size-2.5 rounded-full ${ok ? "bg-teal" : "bg-coral"}`} />
      <span className="max-lg:sr-only">{label}</span>
    </button>
  );
}

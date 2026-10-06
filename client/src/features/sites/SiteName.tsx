import { siteInfo } from "@/lib/siteInfo";

/**
 * A site as people know it: a coloured letter badge and a friendly name. The domain stays available as the
 * tooltip and for screen readers, since two different domains can share a name (m.youtube.com and youtube.com).
 */
export function SiteName({ domain, className = "" }: { domain: string; className?: string }) {
  const { name, color, textColor, letter } = siteInfo(domain);
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`} title={domain}>
      <span
        aria-hidden="true"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ring-1 ring-white/15"
        style={{ background: color, color: textColor }}
      >
        {letter}
      </span>
      <span className="truncate">{name}</span>{" "}
      <span className="sr-only">({domain})</span>
    </span>
  );
}

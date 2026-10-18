/**
 * A change shown with an arrow, such as "▲ 20m vs usual". Sighted users see the arrow text; screen readers hear the
 * spoken sentence instead ("20m more than usual") rather than the arrow's name. `aria-label` is not used for this because
 * it is not reliably announced on a plain <span>.
 */
export function Delta({ text, spoken, className = "" }: { text: string; spoken: string; className?: string }) {
  return (
    <span className={className}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

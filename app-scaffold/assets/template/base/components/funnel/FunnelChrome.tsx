import Logo from "@/components/Logo";

/** One row: wordmark left, the gauge in the right-hand corner. No divider. */
export function FunnelHeader({
  index,
  count,
  label,
}: {
  index: number;
  count: number;
  label: string;
}) {
  return (
    <header>
      <div className="shell flex w-full items-center gap-6 py-3">
        <Logo />
        <ProgressBar count={count} index={index} label={label} />
      </div>
    </header>
  );
}

/**
 * The share of the bar filled: eased, never empty, monotonic, and exactly 1 on the last step.
 * A linear sixteenth puts the reader at 6% just after they answered something, so the curve
 * front-loads it — the bar moves most where readers actually leave.
 */
const FLOOR = 0.04;
const CURVE = 0.7;

function progressFraction(index: number, count: number): number {
  if (count <= 1) return 1;
  const position = Math.min(Math.max(index, 0), count - 1) / (count - 1);
  return FLOOR + (1 - FLOOR) * Math.pow(position, CURVE);
}

function ProgressBar({ count, index, label }: { count: number; index: number; label: string }) {
  const step = Math.min(index + 1, count);
  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-end gap-2.5"
      role="progressbar"
      // The true step, never the eased width: the bar may flatter, a value read aloud may not.
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={count}
      aria-label={label}
    >
      <div className="h-1 min-w-0 max-w-48 flex-1 rounded-full bg-track">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${progressFraction(index, count) * 100}%` }}
        />
      </div>
      {/* Already announced by `aria-valuenow`, so the glyphs are for the eye only. */}
      <span aria-hidden="true" className="num shrink-0 text-[12px] font-medium leading-none text-muted">
        {step}/{count}
      </span>
    </div>
  );
}

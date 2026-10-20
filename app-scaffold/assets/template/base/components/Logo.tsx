/**
 * The mark, then the name, as the header and the done page draw them.
 *
 * One weight and one colour on purpose: the mark carries the visual interest, and a two-tone
 * wordmark beside it is two things asking to be looked at.
 *
 * `mark.png` comes from `bun run icons:build` with the favicon set. Decorative: the name sits next to it in real text,
 * so alt copy would only make a screen reader say the name twice.
 *
 * `inline-flex` rather than `flex`: a page that centres this with `text-center` would otherwise
 * stretch it across the column and park the mark against the left edge.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 align-middle ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ico/mark.png" alt="" width={24} height={24} className="size-6" />
      <span className="font-wordmark text-[17px] font-semibold tracking-[-0.01em] text-ink">
        Appname
      </span>
    </span>
  );
}

export default Logo;

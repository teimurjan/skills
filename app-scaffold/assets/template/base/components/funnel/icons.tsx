import type { JSX } from "preact";

/** The one stroked-icon frame. Lucide's geometry, so a glyph pasted from the package fits. */
export function Glyph({
  size,
  box,
  stroke,
  children,
}: {
  size: number;
  box: number;
  stroke: number;
  children: JSX.Element | JSX.Element[];
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      stroke="currentColor"
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {children}
    </svg>
  );
}

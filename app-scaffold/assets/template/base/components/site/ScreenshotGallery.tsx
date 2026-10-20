"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Shot } from "@/components/site/copy/types";

/**
 * The store frames, scrolled sideways.
 *
 * The same frames uploaded to App Store Connect, downscaled to WebP at
 * `public/screenshots/<locale>` by the generator that composites the originals — the same
 * pictures, not a second set made for the web. Someone who reads this page and then opens
 * the listing should see the same six, in the same order, with the same captions; a site
 * that shows different screenshots from the store is a site that has quietly stopped
 * describing the product it sells.
 *
 * Downscaled because the box below is 240pt wide and the store wants 1290px: serving the
 * uploads themselves is half a megabyte to draw a thumbnail. Change the box and change
 * `WEB_FRAME` in `appstore/scripts/lib/screenshot-kit.mjs` with it.
 *
 * Arrows appear only when there is somewhere to scroll, and the whole thing is a plain
 * overflow container — so with JavaScript off it is still a scrollable strip rather than
 * a cropped row.
 */
export function ScreenshotGallery({ shots }: { shots: Shot[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const element = track.current;
    if (!element) return;
    setCanLeft(element.scrollLeft > 1);
    setCanRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  }, []);

  useEffect(() => {
    sync();
    const element = track.current;
    if (!element) return;
    element.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      element.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  const step = (direction: 1 | -1) => {
    const element = track.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={track}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shots.map((shot) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shot.src}
            src={shot.src}
            alt={shot.alt}
            loading="lazy"
            decoding="async"
            className="h-[520px] w-auto flex-none snap-start rounded-[28px] shadow-[0_2px_12px_rgba(60,35,10,0.14)]"
          />
        ))}
      </div>

      {canLeft && <Arrow direction="left" onClick={() => step(-1)} />}
      {canRight && <Arrow direction="right" onClick={() => step(1)} />}
    </div>
  );
}

function Arrow({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-hidden
      tabIndex={-1}
      className={`absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-on-ink shadow-[0_2px_12px_rgba(60,35,10,0.14)] transition-colors hover:bg-slate ${
        direction === "left" ? "left-2" : "right-2"
      }`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {direction === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}

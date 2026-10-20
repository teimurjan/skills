// Meta Pixel loader, served from our own origin so `next/script` can load it by `src`.
//
// It is a file rather than an inline `<Script>` for two reasons, both learned the hard way:
// an inline script is what Next renders differently between server and client (hydration
// mismatch), and an inline `beforeInteractive` script is emitted as a queued `__next_s`
// push that never executes at all. A `src` script with `onLoad` sidesteps both and gives
// the app a real "pixel is ready" signal — see components/MetaPixel.tsx.
//
// The pixel id arrives as `data-pixel-id` on the tag rather than being baked in here,
// because this file is static and the id is environment-specific.
(function () {
  var tag = document.getElementById("fb-pixel") || document.currentScript;
  var pixelId = tag && tag.getAttribute("data-pixel-id");
  if (!pixelId) return;

  // Meta's standard snippet. The `if (f.fbq) return` guard is why nothing else in the app
  // may pre-create `window.fbq`: a stub built elsewhere would make this bail before
  // `init` ever runs. Anything needing to queue an event early goes through
  // `metaTrack`'s own buffer instead.
  // Meta's snippet, with its leading `!` and its ternary-as-statement rewritten so the
  // linter doesn't read them as unused expressions. Semantics are unchanged.
  (function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      if (n.callMethod) {
        n.callMethod.apply(n, arguments);
      } else {
        n.queue.push(arguments);
      }
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  fbq("init", pixelId);
  // The first PageView. Subsequent ones fire on navigation from MetaPixel's usePathname
  // effect, which skips its initial run so this one is not double-counted.
  fbq("track", "PageView");
})();

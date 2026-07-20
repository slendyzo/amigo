"use client";

import { useEffect } from "react";

/**
 * Publishes the *visual* viewport (the area actually visible to the user) to CSS
 * as --vvh / --vvo on <html>.
 *
 * Why this exists: `dvh` accounts for browser chrome but NOT for the on-screen
 * keyboard. On iOS a `92dvh` panel stays 92dvh tall when the keyboard opens, so
 * its footer ends up behind the keyboard. visualViewport.height is the only
 * value that tracks the keyboard, so modal panels size against it.
 *
 * Ref-counted: several modals can mount at once, and the last one to unmount
 * clears the variables.
 */

let subscribers = 0;
let detach: (() => void) | null = null;

function attach() {
  const vv = window.visualViewport;
  if (!vv) return;

  const update = () => {
    const root = document.documentElement;
    root.style.setProperty("--vvh", `${vv.height}px`);
    // offsetTop is non-zero when the page is pinch-zoomed or the keyboard has
    // pushed the visual viewport down; modals anchor to it so they stay in view.
    root.style.setProperty("--vvo", `${vv.offsetTop}px`);
  };

  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);

  detach = () => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
    const root = document.documentElement;
    root.style.removeProperty("--vvh");
    root.style.removeProperty("--vvo");
  };
}

export function useVisualViewport(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;

    subscribers += 1;
    if (subscribers === 1) attach();

    return () => {
      subscribers -= 1;
      if (subscribers === 0 && detach) {
        detach();
        detach = null;
      }
    };
  }, [isActive]);
}

"use client";

import { useEffect } from "react";

/**
 * Locks background scrolling while a modal is open, and restores the scroll
 * position on close.
 *
 * Ref-counted, unlike the older useModalBodyClass: when two overlays are open
 * (e.g. a picker on top of a form sheet), closing the top one must NOT unlock
 * the body underneath. Only the last one out restores scrolling.
 *
 * Also the thing that stops a stray swipe inside a modal from dragging or
 * zooming the page behind it — paired with `overscroll-behavior: contain` on
 * the modal's scroll region.
 */

let lockCount = 0;
let savedScrollY = 0;

function lock() {
  savedScrollY = window.scrollY;
  document.body.style.top = `-${savedScrollY}px`;
  document.body.classList.add("modal-open");
}

function unlock() {
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, savedScrollY);
}

export function useScrollLock(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;

    lockCount += 1;
    if (lockCount === 1) lock();

    return () => {
      lockCount -= 1;
      if (lockCount === 0) unlock();
    };
  }, [isActive]);
}
